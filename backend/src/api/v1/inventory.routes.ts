import { Router } from 'express';
import { z } from 'zod';
import { auth, AuthRequest, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as inventoryService from '../../services/inventory.service';

// The service reads camelCase (minStockLevel, currentStock, costPerUnit). The form
// sends camelCase too; snake_case is still accepted for older clients. Before this,
// the schema only listed snake_case keys, so stock / minimum / cost from the form
// were stripped by validation and every new item was saved with 0.
const SNAKE_TO_CAMEL: Record<string, string> = {
  current_stock: 'currentStock', min_stock_level: 'minStockLevel', cost_per_unit: 'costPerUnit',
};
const createItemSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
    for (const [snake, camel] of Object.entries(SNAKE_TO_CAMEL)) {
      if (out[camel] === undefined && out[snake] !== undefined) out[camel] = out[snake];
      delete out[snake];
    }
    return out;
  },
  z.object({
    name: z.string().trim().min(1).max(300),
    category: z.string().min(1),
    unit: z.string().min(1),
    currentStock: z.coerce.number().min(0).optional(),
    minStockLevel: z.coerce.number().min(0).optional(),
    costPerUnit: z.coerce.number().min(0).optional(),
    currency: z.string().max(10).optional(),
    supplier: z.string().optional(),
    notes: z.string().optional(),
  }),
);

const txSchema = z.object({
  type: z.enum(['purchase', 'usage', 'adjustment', 'return']),
  quantity: z.number(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  notes: z.string().optional(),
});

const inventoryRouter = Router();
inventoryRouter.use(auth);
/** Inventory item and stock-movement writes: operations manager and worker only. */
export const requireInventoryWriter = authorize('operation_manager', 'worker');

// List items
inventoryRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const result = await inventoryService.listItems({
      category: req.query.category as string,
      search: req.query.search as string,
      lowStockOnly: req.query.low_stock === 'true',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (err) { next(err); }
});

// Low-stock items
inventoryRouter.get('/low-stock', async (_req, res, next) => {
  try {
    const items = await inventoryService.getLowStockItems();
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

// Get single item with transactions
inventoryRouter.get('/:id', async (req, res, next) => {
  try {
    const item = await inventoryService.getItem(req.params.id);
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

// Create item
inventoryRouter.post('/', requireInventoryWriter, validate({ body: createItemSchema }), async (req: AuthRequest, res, next) => {
  try {
    const item = await inventoryService.createItem({ ...req.body, createdBy: req.user!.userId });
    res.status(201).json({ success: true, data: item });
  } catch (err) { next(err); }
});

// Update item
inventoryRouter.put('/:id', requireInventoryWriter, async (req, res, next) => {
  try {
    const item = await inventoryService.updateItem(req.params.id, req.body);
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

// Soft-delete item
inventoryRouter.delete('/:id', requireInventoryWriter, async (req, res, next) => {
  try {
    await inventoryService.deleteItem(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Record a transaction (purchase, adjustment, return)
inventoryRouter.post('/:id/transactions', requireInventoryWriter, validate({ body: txSchema }), async (req: AuthRequest, res, next) => {
  try {
    const tx = await inventoryService.recordTransaction(
      req.params.id,
      req.body.type,
      req.body.quantity,
      req.body.referenceType || 'manual',
      req.body.referenceId || null,
      req.body.notes || null,
      req.user!.userId,
    );
    res.status(201).json({ success: true, data: tx });
  } catch (err) { next(err); }
});

// Transaction history for an item
inventoryRouter.get('/:id/transactions', async (req, res, next) => {
  try {
    const txs = await inventoryService.getTransactionHistory(
      req.params.id,
      req.query.start_date as string,
      req.query.end_date as string,
    );
    res.json({ success: true, data: txs });
  } catch (err) { next(err); }
});

export { inventoryRouter };
