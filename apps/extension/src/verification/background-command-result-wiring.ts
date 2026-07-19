import type { MessageBus } from "../messaging/bus.js";
import type { BackgroundCommandRouter } from "./background-command-router.js";
import {
  BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
  LOCAL_VERIFY_RESULT_MESSAGE_TYPE,
} from "./content-command-wiring.js";

export function installBackgroundCommandResultHandlers(
  bus: MessageBus,
  router: BackgroundCommandRouter,
): void {
  bus.on(BRIDGE_COMMAND_RESULT_MESSAGE_TYPE, (message, sender) => {
    router.handleContentResult(message, sender);
  });
  bus.on(LOCAL_VERIFY_RESULT_MESSAGE_TYPE, (message, sender) => {
    router.handleContentResult(message, sender);
  });
}
