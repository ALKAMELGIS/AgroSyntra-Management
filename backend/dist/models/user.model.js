"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASSIGNABLE_ROLES = exports.ROLE_HIERARCHY = void 0;
exports.ROLE_HIERARCHY = {
    ceo: 5,
    farm_manager: 4,
    operation_manager: 3,
    agronomist: 2,
    pest_agronomist: 2,
    intern_teacher: 2,
    auditor: 2,
    operator: 1,
    scouter: 1,
    worker: 1,
    intern_student: 0,
};
exports.ASSIGNABLE_ROLES = {
    ceo: ['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist', 'auditor', 'scouter', 'worker', 'operator', 'intern_teacher', 'intern_student'],
    farm_manager: ['operation_manager', 'agronomist', 'pest_agronomist', 'auditor', 'scouter', 'worker', 'operator', 'intern_teacher', 'intern_student'],
    operation_manager: ['agronomist', 'pest_agronomist', 'auditor', 'scouter', 'worker', 'operator', 'intern_teacher', 'intern_student'],
    agronomist: [],
    pest_agronomist: ['scouter', 'operator'],
    auditor: [],
    operator: [],
    scouter: [],
    intern_teacher: [],
    worker: [],
    intern_student: [],
};
