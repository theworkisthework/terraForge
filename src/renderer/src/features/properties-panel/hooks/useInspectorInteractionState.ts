import { useState } from "react";
import type { RotStep } from "../utils/rotation";

export function useInspectorInteractionState() {
  const [rotStep, setRotStep] = useState<RotStep>(45);
  const [stepFlyoutOpen, setStepFlyoutOpen] = useState(false);
  const [ratioLocked, setRatioLocked] = useState(true);
  const [templateAlignEnabled, setTemplateAlignEnabled] = useState(false);
  const [templateAlignTarget, setTemplateAlignTarget] = useState<
    "page" | "margin"
  >("page");
  const [templateScaleEnabled, setTemplateScaleEnabled] = useState(false);
  const [templateScaleTarget, setTemplateScaleTarget] = useState<
    "page" | "margin"
  >("page");

  const toggleStepFlyout = () => {
    setStepFlyoutOpen((open) => !open);
  };

  const closeStepFlyout = () => {
    setStepFlyoutOpen(false);
  };

  const selectRotStep = (step: RotStep) => {
    setRotStep(step);
    setStepFlyoutOpen(false);
  };

  return {
    rotStep,
    stepFlyoutOpen,
    ratioLocked,
    templateAlignEnabled,
    templateAlignTarget,
    templateScaleEnabled,
    templateScaleTarget,
    setRatioLocked,
    setTemplateAlignEnabled,
    setTemplateAlignTarget,
    setTemplateScaleEnabled,
    setTemplateScaleTarget,
    toggleStepFlyout,
    closeStepFlyout,
    selectRotStep,
  };
}
