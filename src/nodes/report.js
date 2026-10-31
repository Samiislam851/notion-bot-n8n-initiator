// Final response for the test webhook: what happened to every document in this run.
const results = $input.all().map((i) => i.json).filter((r) => !r.skipped);
return [{ json: { processed: results.length, results } }];
