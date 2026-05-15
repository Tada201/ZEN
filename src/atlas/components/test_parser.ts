import { createStreamingParser } from '@openuidev/lang-core';
import { extendedLibrary } from './genui/index';

const schema = extendedLibrary.toJSONSchema();
const sp = createStreamingParser(schema, extendedLibrary.root);

const code = `
title = Text("Dashboard Overview", variant="heading")
subtitle = Text("Key metrics and performance indicators", variant="body")
metric1 = PriceItem(label="Active Users", value="1,240")
metric2 = PriceItem(label="Revenue", value="$42.5K")
root = Stack(children=[title, subtitle, metric1, metric2], gap=4)
`;

try {
  const result = sp.set(code);
  console.log("ROOT IS:", result.root ? "DEFINED" : "NULL");
  if (result.meta?.errors?.length) {
    console.log("ERRORS:", JSON.stringify(result.meta.errors, null, 2));
  }
} catch (e) {
  console.error("CRASH:", e);
}
