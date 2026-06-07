/**
 * MachineConfigDialog
 *
 * Full CRUD UI for managing machine configuration profiles.
 * Opened from the Settings button in the Toolbar.
 */

import React, { useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog";
import { TabHeader } from "../TabHeader";
import { PEN_DEFAULTS } from "./utils/machineConfigDefaults";
import {
  MachineConfigurationsTab,
  ApplicationConfigurationTab,
} from "./components";
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

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
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
                  { id: "machines", label: "Machine Configurations" },
                  { id: "application", label: "Application Configuration" },
                ]}
                className="border-b-0"
              />
            </div>
            <button
              onClick={onClose}
              aria-label="Dismiss"
              className="text-content-muted hover:text-content transition-colors text-xl leading-none"
            >
              ×
            </button>
          </div>

          {activeTab === "machines" ? (
            <MachineConfigurationsTab controller={controller} />
          ) : (
            <ApplicationConfigurationTab controller={controller} />
          )}

          {activeTab === "machines" ? (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border-ui">
              <button
                onClick={controller.handleActivate}
                disabled={!selectedId || isNew || connected}
                title={
                  connected
                    ? "Disconnect before switching the active machine"
                    : undefined
                }
                className="px-4 py-2 text-sm bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Set as Active
              </button>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm bg-secondary hover:bg-secondary-hover text-content rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={controller.handleSave}
                  disabled={!controller.isDirty || controller.isLocked}
                  className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {controller.isDirty ? "Save Changes" : "Saved"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end px-6 py-4 border-t border-border-ui">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm bg-secondary hover:bg-secondary-hover text-content rounded-lg transition-colors"
              >
                Close
              </button>
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
