import api from './api';

export const PEST_APP_PAGE_SIZE = 2000;

export async function listAllPesticideApplications(params, pageSize = PEST_APP_PAGE_SIZE) {
  const query = new URLSearchParams(params);
  const size = pageSize > 0 ? pageSize : PEST_APP_PAGE_SIZE;
  const all = [];
  let page = 1;
  let total = Infinity;
  while (all.length < total) {
    query.set('limit', String(size));
    query.set('page', String(page));
    const res = await api.get(`/ipm/pesticide-applications?${query.toString()}`);
    const items = res.data?.data || [];
    const reported = Number(res.data?.meta?.total);
    if (Number.isFinite(reported)) total = reported;
    else total = all.length + items.length;
    all.push(...items);
    if (items.length === 0 || items.length < size) break;
    page += 1;
  }
  return { items: all, meta: { total: Number.isFinite(total) && total !== Infinity ? total : all.length } };
}
