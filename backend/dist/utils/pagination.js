"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePagination = normalizePagination;
exports.buildPaginationMeta = buildPaginationMeta;
function normalizePagination(params) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(10000, Math.max(1, params.limit ?? 20));
    return { page, limit, offset: (page - 1) * limit };
}
function buildPaginationMeta(total, page, limit) {
    return {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}
