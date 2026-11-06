import { tool } from 'ai';
import { z } from 'zod';
import { getFxRates } from '@/lib/actions/fx-actions';

// Unlike every other tool here, the actual math isn't computed server-side
// at all -- this just opens an interactive calculator (see
// tools-ui/pricing-calculator-panel.tsx) and hands it today's bank rate to
// start from. The user types their own numbers in and watches each step
// compute live; Eva only hears back from it once they hit Save (see
// mentor-chat-client.tsx, which turns that into a plain follow-up chat
// message she responds to, and that the deterministic memory extraction
// in lib/mentor/memory-extraction.ts records afterward).
export function createCalculatePricingTool() {
  return tool({
    description: `Open an interactive step-by-step calculator: unit cost,
      profit margin, then converting to dollars at today's bank rate.
      Call this only when the user wants to work out a real price for
      their own product ("help me price this", "what should I charge for
      my garri") -- not for an abstract question like "what's a typical
      margin", answer that directly instead. Don't do the pricing math
      yourself when this applies -- call the tool instead of a static
      formula.`,
    inputSchema: z.object({
      product: z
        .string()
        .nullable()
        .describe(
          `The product being priced, resolved from the conversation or
            what you already know about them, e.g. "crayfish". Used only
            to prefill a market-price search link, not required for the
            math itself. Null if genuinely unclear.`
        ),
    }),
    execute: async ({ product }) => {
      // Only the bank-rate side -- this calculator is specifically the
      // naira-to-dollar quoting step (divide by bank rate, per the
      // course material), not the withdrawal-side black-market
      // conversion, so there's nothing for it to do with the other rate.
      const { bank } = await getFxRates();
      console.log('[mentor] calculatePricing call:', { product, ...bank });
      return {
        product,
        bankRate: bank.rate,
        asOf: bank.asOf,
        isFallback: bank.isFallback,
      };
    },
  });
}
