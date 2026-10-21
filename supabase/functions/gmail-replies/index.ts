import {deps} from '../_shared/runtime.mjs';
import {replyHandler} from '../_shared/reply-monitor.mjs';
Deno.serve(replyHandler(deps));
