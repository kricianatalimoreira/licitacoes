import {deps} from '../_shared/runtime.mjs';
import {contractHandler} from '../_shared/contracts.mjs';
Deno.serve(contractHandler(deps));
