# Writing a metric

A metric plugin must produce evidence that is measurable, reproducible and clearly scoped.

## Required behaviour

- accept evaluation evidence as input;
- produce a normalised measurement;
- expose confidence, limitations and raw evidence;
- avoid returning only a score without context;
- represent uncertainty explicitly when data is incomplete.

## Expected output

A metric should provide:

- raw evidence;
- normalised measurement;
- optional score;
- confidence and limitations.
