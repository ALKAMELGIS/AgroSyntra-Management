"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValveService = void 0;
const valve_repository_1 = require("../repositories/valve.repository");
class ValveService {
    constructor() {
        this.repository = new valve_repository_1.ValveRepository();
    }
    listByField(fieldId) {
        return this.repository.listByField(fieldId);
    }
    replaceForField(fieldId, valves) {
        return this.repository.replaceForField(fieldId, valves);
    }
}
exports.ValveService = ValveService;
