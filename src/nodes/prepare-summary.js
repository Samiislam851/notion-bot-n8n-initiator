// One item per Supplier Monthly Summary row that must be recalculated
// (two when an update moved a cost to another month/currency).
const ctx = $('Build Notion Payload').first().json;
const targets = ctx.decision.recalc || [];
return targets.map((target) => ({ json: { target } }));
