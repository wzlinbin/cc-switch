import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsQuery } from "@/lib/query";
import {
  decideBalanceAlert,
  extractAlertBalance,
  loadBalanceAlertState,
  resolveBalanceAlertSettings,
  saveBalanceAlertState,
  sendLowBalanceNotification,
} from "@/lib/balanceAlert";
import type { UsageResult } from "@/types";

/**
 * 余额不足桌面提醒：监听一次用量查询的新结果，剩余额度跌破阈值时弹系统通知。
 *
 * 只对查询成功的新结果（dataUpdatedAt 变化）判定一次；失败结果不判定，
 * keep-last-good 展示的旧值不会因时间流逝重复触发。防刷屏与恢复重置
 * 逻辑见 `@/lib/balanceAlert`。
 */
export function useLowBalanceAlert(args: {
  providerId: string;
  appId: string;
  providerName: string;
  usage: UsageResult | undefined;
  dataUpdatedAt: number;
}): void {
  const { providerId, appId, providerName, usage, dataUpdatedAt } = args;
  const { t } = useTranslation();
  const { data: settings } = useSettingsQuery();
  const seenUpdatedAtRef = useRef(0);

  useEffect(() => {
    // 设置尚未加载时不判定、也不标记已读，等设置到达后再处理同一份结果。
    if (!settings) return;
    if (!usage?.success || !usage.data) return;
    if (dataUpdatedAt <= seenUpdatedAtRef.current) return;
    seenUpdatedAtRef.current = dataUpdatedAt;

    const { enabled, threshold } = resolveBalanceAlertSettings(settings);
    if (!enabled) return;
    const balance = extractAlertBalance(usage.data);
    if (!balance) return;

    const key = `${appId}:${providerId}`;
    const alertedKeys = loadBalanceAlertState();
    const { notify, nextAlertedKeys } = decideBalanceAlert({
      key,
      remaining: balance.remaining,
      threshold,
      alertedKeys,
      now: Date.now(),
    });
    if (nextAlertedKeys !== alertedKeys) {
      saveBalanceAlertState(nextAlertedKeys);
    }
    if (!notify) return;

    const unit = balance.unit ? ` ${balance.unit}` : "";
    void sendLowBalanceNotification(
      t("balanceAlert.notificationTitle", { defaultValue: "余额不足" }),
      t("balanceAlert.notificationBody", {
        provider: providerName,
        balance: balance.remaining.toFixed(2),
        unit,
        threshold,
        defaultValue:
          "{{provider}} 剩余额度 {{balance}}{{unit}}，低于提醒阈值 {{threshold}}，请及时充值。",
      }),
    );
  }, [settings, usage, dataUpdatedAt, providerId, appId, providerName, t]);
}
