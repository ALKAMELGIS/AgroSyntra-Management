"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computePestInfestationPct = computePestInfestationPct;
exports.pestGroupKey = pestGroupKey;
exports.applyInfestationToObservations = applyInfestationToObservations;
exports.deriveHeadlineFromObservations = deriveHeadlineFromObservations;
function computePestInfestationPct(plantCount, sumSegmentAverages, samplingUnits) {
    if (!Number.isFinite(plantCount) || plantCount <= 0)
        return null;
    if (!Number.isFinite(samplingUnits) || samplingUnits <= 0)
        return null;
    if (!Number.isFinite(sumSegmentAverages) || sumSegmentAverages < 0)
        return null;
    const pct = (plantCount * sumSegmentAverages) / samplingUnits;
    return Number(pct.toFixed(2));
}
function pestGroupKey(obs) {
    if (obs.pestDiseaseId)
        return `id:${obs.pestDiseaseId}`;
    return `name:${(obs.pestName || '').trim().toLowerCase()}`;
}
function rowHasSampleData(obs) {
    if (obs.average != null && obs.average !== 0)
        return true;
    if (obs.total != null && obs.total !== 0)
        return true;
    const counts = [
        obs.count1, obs.count2, obs.count3, obs.count4, obs.count5,
        obs.count6, obs.count7, obs.count8, obs.count9, obs.count10,
    ];
    return counts.some((v) => v != null && v !== '');
}
function applyInfestationToObservations(observations, plantCount, samplingUnits) {
    if (!observations.length)
        return observations;
    const sumAvgByPest = new Map();
    for (const obs of observations) {
        if (!rowHasSampleData(obs))
            continue;
        const key = pestGroupKey(obs);
        const avg = obs.average ?? 0;
        sumAvgByPest.set(key, (sumAvgByPest.get(key) ?? 0) + avg);
    }
    const pctByPest = new Map();
    for (const [key, sumAvg] of sumAvgByPest.entries()) {
        pctByPest.set(key, computePestInfestationPct(plantCount, sumAvg, samplingUnits));
    }
    return observations.map((obs) => {
        const key = pestGroupKey(obs);
        const pct = pctByPest.get(key);
        if (pct == null) {
            return { ...obs, percent: undefined };
        }
        return { ...obs, percent: pct };
    });
}
function deriveHeadlineFromObservations(observations) {
    let maxObs = null;
    let best = -1;
    for (const obs of observations) {
        const metric = obs.percent ?? -1;
        if (metric > best) {
            best = metric;
            maxObs = obs;
        }
    }
    if (!maxObs || maxObs.percent == null) {
        return { headlinePct: null, headlinePestId: null, headlineCustom: null };
    }
    return {
        headlinePct: maxObs.percent,
        headlinePestId: maxObs.pestDiseaseId ?? null,
        headlineCustom: maxObs.pestDiseaseId ? null : maxObs.pestName ?? null,
    };
}
