import { deps } from '../_shared/runtime.mjs';
import { syncHandler } from '../_shared/sync.mjs';
Deno.serve(syncHandler(deps));
