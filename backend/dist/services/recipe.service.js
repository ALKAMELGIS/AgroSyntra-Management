"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecipeService = void 0;
const recipe_repository_1 = require("../repositories/recipe.repository");
const pagination_1 = require("../utils/pagination");
class RecipeService {
    constructor() {
        this.repository = new recipe_repository_1.RecipeRepository();
    }
    async list(params) {
        const { items, total } = await this.repository.list(params);
        const { page, limit } = (0, pagination_1.normalizePagination)(params);
        return { items, meta: (0, pagination_1.buildPaginationMeta)(total, page, limit) };
    }
    getById(id) {
        return this.repository.getById(id);
    }
    create(payload) {
        return this.repository.create(payload);
    }
    update(id, payload) {
        return this.repository.update(id, payload);
    }
    remove(id) {
        return this.repository.delete(id);
    }
}
exports.RecipeService = RecipeService;
