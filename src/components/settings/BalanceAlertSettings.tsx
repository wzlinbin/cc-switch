import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsFormState } from "@/hooks/useSettings";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { DEFAULT_BALANCE_ALERT_THRESHOLD } from "@/lib/balanceAlert";
import { SettingsRow, SettingsSwitchRow } from "./SettingsLayout";

export function BalanceAlertSettings({
  settings,
  onChange,
}: {
  settings: SettingsFormState;
  onChange: (
    updates: Partial<SettingsFormState>,
  ) => void | boolean | Promise<void | boolean>;
}) {
  const { t } = useTranslation();
  const id = useId();
  const enabled = settings.balanceAlertEnabled ?? true;
  const threshold =
    settings.balanceAlertThreshold ?? DEFAULT_BALANCE_ALERT_THRESHOLD;
  // Keep edits separate from optimistic settings and their possible rollback.
  const [draft, setDraft] = useState<string>();
  const value = draft ?? String(threshold);
  const [saving, setSaving] = useState(false);
  const valid = (text: string) =>
    /^\d+(\.\d+)?$/.test(text) &&
    Number(text) > 0 &&
    Number.isFinite(Number(text));
  const invalid = !valid(value);
  const dirty = !invalid && Number(value) !== threshold;

  const save = async (nextThreshold: number) => {
    setSaving(true);
    try {
      const saved = await onChange({ balanceAlertThreshold: nextThreshold });
      if (saved !== false) {
        setDraft(undefined);
      }
    } catch {
      toast.error(t("notifications.saveFailedGeneric"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsSwitchRow
        label={t("settings.balanceAlert.title")}
        help={{
          title: t("settings.balanceAlert.title"),
          body: t("settings.balanceAlert.help"),
        }}
        checked={enabled}
        disabled={saving}
        onCheckedChange={(next) => void onChange({ balanceAlertEnabled: next })}
      />
      {enabled && (
        <SettingsRow label={t("settings.balanceAlert.threshold")}>
          <div className="flex flex-wrap items-end gap-3">
            <label
              htmlFor={`${id}-threshold`}
              className="space-y-1 text-caption text-fg-2"
            >
              <span>{t("settings.balanceAlert.thresholdLabel")}</span>
              <Input
                id={`${id}-threshold`}
                type="number"
                min={0}
                step="any"
                value={value}
                disabled={saving}
                aria-invalid={invalid}
                aria-describedby={`${id}-hint`}
                onChange={(event) => setDraft(event.target.value)}
                className="w-24"
              />
            </label>
            <Button
              variant="solid"
              size="compact"
              disabled={saving || invalid || !dirty}
              onClick={() => void save(Number(value))}
            >
              {t("settings.balanceAlert.save")}
            </Button>
            <Button
              variant="outline"
              size="compact"
              disabled={saving}
              onClick={() => void save(DEFAULT_BALANCE_ALERT_THRESHOLD)}
            >
              {t("settings.balanceAlert.reset")}
            </Button>
          </div>
          <p
            id={`${id}-hint`}
            className="mt-2 text-caption text-fg-2"
            role={invalid ? "alert" : undefined}
          >
            {t(
              invalid
                ? "settings.balanceAlert.invalid"
                : "settings.balanceAlert.hint",
            )}
          </p>
        </SettingsRow>
      )}
    </>
  );
}
