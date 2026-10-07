import {deps} from '../_shared/runtime.mjs';
import {robotHandler} from '../_shared/robot.mjs';
Deno.serve(robotHandler(deps));
