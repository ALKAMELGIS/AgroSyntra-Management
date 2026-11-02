"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
/**
 * Test validation schemas used across the API.
 * These tests ensure our Zod schemas correctly validate input data.
 */
describe('API Validation Schemas', () => {
    // Common schemas used across the app
    const emailSchema = zod_1.z.string().email();
    const uuidSchema = zod_1.z.string().uuid();
    const dateSchema = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    const positiveNumberSchema = zod_1.z.number().positive();
    const roleSchema = zod_1.z.enum(['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker']);
    describe('Email validation', () => {
        it('accepts valid emails', () => {
            expect(emailSchema.safeParse('user@example.com').success).toBe(true);
            expect(emailSchema.safeParse('name.last@domain.org').success).toBe(true);
        });
        it('rejects invalid emails', () => {
            expect(emailSchema.safeParse('notanemail').success).toBe(false);
            expect(emailSchema.safeParse('@missing.com').success).toBe(false);
            expect(emailSchema.safeParse('').success).toBe(false);
        });
    });
    describe('UUID validation', () => {
        it('accepts valid UUIDs', () => {
            expect(uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
        });
        it('rejects invalid UUIDs', () => {
            expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
            expect(uuidSchema.safeParse('123').success).toBe(false);
        });
    });
    describe('Date validation', () => {
        it('accepts YYYY-MM-DD format', () => {
            expect(dateSchema.safeParse('2025-01-15').success).toBe(true);
            expect(dateSchema.safeParse('2025-12-31').success).toBe(true);
        });
        it('rejects invalid date formats', () => {
            expect(dateSchema.safeParse('01-15-2025').success).toBe(false);
            expect(dateSchema.safeParse('2025/01/15').success).toBe(false);
            expect(dateSchema.safeParse('Jan 15, 2025').success).toBe(false);
        });
    });
    describe('Role validation', () => {
        it('accepts all valid roles', () => {
            const roles = ['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'];
            roles.forEach((role) => {
                expect(roleSchema.safeParse(role).success).toBe(true);
            });
        });
        it('rejects invalid roles', () => {
            expect(roleSchema.safeParse('admin').success).toBe(false);
            expect(roleSchema.safeParse('superuser').success).toBe(false);
            expect(roleSchema.safeParse('').success).toBe(false);
        });
    });
    describe('Positive number validation', () => {
        it('accepts positive numbers', () => {
            expect(positiveNumberSchema.safeParse(1).success).toBe(true);
            expect(positiveNumberSchema.safeParse(0.5).success).toBe(true);
            expect(positiveNumberSchema.safeParse(1000).success).toBe(true);
        });
        it('rejects zero and negative numbers', () => {
            expect(positiveNumberSchema.safeParse(0).success).toBe(false);
            expect(positiveNumberSchema.safeParse(-1).success).toBe(false);
        });
    });
    // Cost entry schema
    describe('Cost Entry Schema', () => {
        const costSchema = zod_1.z.object({
            category: zod_1.z.enum(['fertilizer', 'labor', 'equipment', 'seeds', 'water', 'fuel', 'maintenance', 'other']),
            amount: zod_1.z.number().positive(),
            date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            description: zod_1.z.string().optional(),
            field_id: zod_1.z.string().uuid().optional(),
            currency: zod_1.z.string().length(3).default('AED'),
        });
        it('accepts valid cost entry', () => {
            const result = costSchema.safeParse({
                category: 'fertilizer',
                amount: 150.50,
                date: '2025-06-15',
                description: 'NPK fertilizer',
                field_id: '550e8400-e29b-41d4-a716-446655440000',
            });
            expect(result.success).toBe(true);
        });
        it('rejects invalid category', () => {
            const result = costSchema.safeParse({
                category: 'invalid',
                amount: 100,
                date: '2025-01-01',
            });
            expect(result.success).toBe(false);
        });
        it('rejects negative amount', () => {
            const result = costSchema.safeParse({
                category: 'labor',
                amount: -50,
                date: '2025-01-01',
            });
            expect(result.success).toBe(false);
        });
    });
    // Shift schema
    describe('Shift Schema', () => {
        const shiftSchema = zod_1.z.object({
            user_id: zod_1.z.string().uuid(),
            shift_type: zod_1.z.enum(['morning', 'afternoon', 'night', 'full_day']),
            date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            start_time: zod_1.z.string().regex(/^\d{2}:\d{2}$/),
            end_time: zod_1.z.string().regex(/^\d{2}:\d{2}$/),
            field_id: zod_1.z.string().uuid().optional(),
            notes: zod_1.z.string().max(500).optional(),
        });
        it('accepts valid shift', () => {
            const result = shiftSchema.safeParse({
                user_id: '550e8400-e29b-41d4-a716-446655440000',
                shift_type: 'morning',
                date: '2025-06-01',
                start_time: '06:00',
                end_time: '14:00',
            });
            expect(result.success).toBe(true);
        });
        it('rejects invalid shift type', () => {
            const result = shiftSchema.safeParse({
                user_id: '550e8400-e29b-41d4-a716-446655440000',
                shift_type: 'overtime',
                date: '2025-06-01',
                start_time: '06:00',
                end_time: '14:00',
            });
            expect(result.success).toBe(false);
        });
    });
    // Webhook schema
    describe('Webhook Schema', () => {
        const webhookSchema = zod_1.z.object({
            url: zod_1.z.string().url(),
            events: zod_1.z.array(zod_1.z.string()).min(1),
        });
        it('accepts valid webhook config', () => {
            const result = webhookSchema.safeParse({
                url: 'https://example.com/webhook',
                events: ['harvest.created', 'task.updated'],
            });
            expect(result.success).toBe(true);
        });
        it('rejects invalid URL', () => {
            const result = webhookSchema.safeParse({
                url: 'not-a-url',
                events: ['harvest.created'],
            });
            expect(result.success).toBe(false);
        });
        it('rejects empty events array', () => {
            const result = webhookSchema.safeParse({
                url: 'https://example.com/webhook',
                events: [],
            });
            expect(result.success).toBe(false);
        });
    });
});
