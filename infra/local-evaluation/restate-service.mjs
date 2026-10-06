import * as restate from '@restatedev/restate-sdk';
import { mockStep, stepIds } from './workload.mjs';

const pipeline = restate.service({
  name: 'OrchevalSequential',
  handlers: {
    run: async (ctx, execution) => {
      let previous = { state: { completed: [], output: null }, steps: [] };
      for (const id of stepIds) {
        const result = await ctx.run(id, () => mockStep(id, previous.state, execution));
        previous = { state: result.state, steps: [...previous.steps, result.observation], output: result.state.output };
      }
      return { execution, ...previous };
    },
  },
});

await restate.serve({ services: [pipeline], port: Number(process.env.PORT ?? 9080) });
