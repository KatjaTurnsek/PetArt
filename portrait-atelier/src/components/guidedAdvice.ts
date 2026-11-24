import { atelierState } from "../app/atelierState";

export interface GuidedAdviceOptions {
  id: string;
  heading?: string;
  text?: string;
}

export interface GuidedAdvice {
  element: HTMLElement;
  update: (text: string) => void;
  syncVisibility: () => void;
}

/**
 * Creates a reusable artist guidance card.
 *
 * Each screen controls the advice content and placement.
 * The component handles its structure and visibility.
 */
export function createGuidedAdvice({
  id,
  heading = "A little advice from your artist",
  text = "",
}: GuidedAdviceOptions): GuidedAdvice {
  const element = document.createElement("aside");
  element.id = id;
  element.className = "guided-advice";
  element.hidden = true;

  const headingElement = document.createElement("h3");
  headingElement.id = `${id}-heading`;
  headingElement.textContent = heading;

  element.setAttribute("aria-labelledby", headingElement.id);

  const textElement = document.createElement("p");
  textElement.textContent = text;

  element.append(headingElement, textElement);

  /**
   * Shows guidance only when Guided Mode is active.
   */
  function syncVisibility(): void {
    element.hidden = atelierState.mode !== "guided";
  }

  /**
   * Updates the advice without recreating the element.
   */
  function update(newText: string): void {
    textElement.textContent = newText;
    syncVisibility();
  }

  syncVisibility();

  return {
    element,
    update,
    syncVisibility,
  };
}
