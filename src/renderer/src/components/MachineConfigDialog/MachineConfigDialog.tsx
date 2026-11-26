/**
 * MachineConfigDialog
 *
 * Full CRUD UI for managing machine configuration profiles.
 * Opened from the Settings button in the Toolbar.
 */

import React, { useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog";
import { Button } from "../ui";
import { TabHeader } from "../TabHeader";
import { useModalFocus } from "../../hooks/useModalFocus";
import { PEN_DEFAULTS } from "./utils/machineConfigDefaults";
import {
  MachineConfigurationsTab,
  ApplicationConfigurationTab,
} from "./components";
import { MachineConnectButton } from "./components/MachineConnectButton";
import { useMachineConfigDialogController } from "./hooks/useMachineConfigDialogController";
import type { MachineConfigDialogController } from "./hooks/useMachineConfigDialogController";

interface Props {
  onClose: () => void;
}

type ConfigTab = "machines" | "application";

export function MachineConfigDialog({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<ConfigTab>("machines");
  const controller: MachineConfigDialogController =
    useMachineConfigDialogController();

  const { machineStore, selectedId, isNew, pendingPenType, setPendingPenType } =
    controller;
  const { connected } = machineStore;
  // No Escape-to-close: it would throw away unsaved edits on a stray keypress.
  const { ref, onKeyDown } = useModalFocus<HTMLDivElement>();

  return (
    <>
      <div
        ref={ref}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onKeyDown={onKeyDown}
        tabIndex={-1}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="machine-config-title"
          className="bg-app border border-border-ui rounded-xl shadow-2xl w-[780px] h-[90vh] max-h-[90vh] flex flex-col"
        >
          <div className="flex items-center justify-between px-6 pt-4 border-b border-border-ui">
            <div id="machine-config-title" className="min-w-0 flex-1 pr-4">
              <TabHeader<ConfigTab>
                ariaLabel="Configuration sections"
                activeTab={activeTab}
                onTabChange={setActiveTab}
                tabs={[
                  { id: "machines", label: "Machines" },
                  { id: "application", label: "Application" },
                ]}
                className="border-b-0"
              />
            </div>
            <Button
              onClick={onClose}
              aria-label="Dismiss"
              variant="ghost"
              className="text-xl leading-none"
            >
              ×
            </Button>
          </div>

          {activeTab === "machines" ? (
            <MachineConfigurationsTab controller={controller} />
          ) : (
            <ApplicationConfigurationTab controller={controller} />
          )}

          {activeTab === "machines" ? (
            <div className="flex items-center gap-3 px-6 py-4 border-t border-border-ui">
              <Button
                onClick={controller.handleActivate}
                disabled={!selectedId || isNew || connected}
                title={
                  connected
                    ? "Disconnect before switching the active machine"
                    : undefined
                }
                className="px-4 py-2 text-sm bg-green-700 hover:bg-green-600 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Set as Active
              </Button>
              <MachineConnectButton
                selectedId={selectedId}
                isNew={isNew}
                isDirty={controller.isDirty}
              />
              <div className="flex gap-3 ml-auto">
                <Button variant="secondary" size="lg" onClick={onClose}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={controller.handleSave}
                  // A connected machine's settings are locked, all but its
                  // ink stations — which is then all there is to save.
                  disabled={!controller.isDirty}
                >
                  {controller.isDirty ? "Save Changes" : "Saved"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end px-6 py-4 border-t border-border-ui">
              <Button variant="secondary" size="lg" onClick={onClose}>
                Close
              </Button>
            </div>
          )}
        </div>
      </div>

      {pendingPenType && (
        <ConfirmDialog
          title="Reset Pen Commands?"
          message={`Reset pen commands to defaults for "${pendingPenType}"?\n\nUp: ${PEN_DEFAULTS[pendingPenType as keyof typeof PEN_DEFAULTS].penUpCommand}\nDown: ${PEN_DEFAULTS[pendingPenType as keyof typeof PEN_DEFAULTS].penDownCommand}\nDown delay: ${PEN_DEFAULTS[pendingPenType as keyof typeof PEN_DEFAULTS].penDownDelayMs} ms\nUp delay: ${PEN_DEFAULTS[pendingPenType as keyof typeof PEN_DEFAULTS].penUpDelayMs} ms`}
          confirmLabel="Reset"
          onConfirm={() => {
            const d = PEN_DEFAULTS[pendingPenType as keyof typeof PEN_DEFAULTS];
            controller.change({
              penType: pendingPenType,
              penUpCommand: d.penUpCommand,
              penDownCommand: d.penDownCommand,
              penDownDelayMs: d.penDownDelayMs,
              penUpDelayMs: d.penUpDelayMs,
            });
            setPendingPenType(null);
          }}
          onCancel={() => {
            controller.change({ penType: pendingPenType });
            setPendingPenType(null);
          }}
        />
      )}
      {controller.showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Configuration"
          message="Delete this machine configuration? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={async () => {
            controller.setShowDeleteConfirm(false);
            await controller.doDelete();
          }}
          onCancel={() => controller.setShowDeleteConfirm(false)}
        />
      )}
      {controller.alertInfo && (
        <ConfirmDialog
          title={controller.alertInfo.title}
          message={controller.alertInfo.message}
          confirmLabel="OK"
          onConfirm={() => controller.setAlertInfo(null)}
        />
      )}
    </>
  );
}
