/**
 * Re-export shared EventBus for backwards compatibility
 *
 * The reader previously had its own EventBus instance.
 * Now we use the shared singleton from src/shared/EventBus.ts
 * This file is kept for backwards compatibility with existing imports.
 *
 * @deprecated Import from "../../shared/EventBus" instead
 */
import EventBus from "../../shared/EventBus"

export default EventBus
