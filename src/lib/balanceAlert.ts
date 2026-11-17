import type { Settings, UsageData } from "@/types";

/**
 * 余额不足桌面提醒：用量查询返回的剩余额度低于阈值时，弹一条系统通知。
 *
 * 防刷屏规则（与服务端版余额提醒一致）：
 * - 每个供应商在一次低余额期间只提醒一次；余额恢复到阈值以上后重置，下次再跌破才提醒。
 * - 已提醒状态持久化到 localStorage，重启应用不会对同一轮低余额重复提醒。
 */

export const DEFAULT_BALANCE_ALERT_THRESHOLD = 5;

export interface ResolvedBalanceAlertSettings {
  enabled: boolean;
  threshold: number;
}

/** 从设置里解析提醒开关与阈值：缺字段时默认开启、阈值 5；非法阈值回落到默认值。 */
export function resolveBalanceAlertSettings(
  settings?: Settings | null,
): ResolvedBalanceAlertSettings {
  const threshold = settings?.balanceAlertThreshold;
  return {
    enabled: settings?.balanceAlertEnabled ?? true,
    threshold:
      typeof threshold === "number" &&
      Number.isFinite(threshold) &&
      threshold > 0
        ? threshold
        : DEFAULT_BALANCE_ALERT_THRESHOLD,
  };
}

/**
 * 取用于提醒判定的剩余额度：第一个有效套餐（isValid 不为 false）里
 * 有限的 remaining 数值。remaining 为 -1 在本项目表示无限额度，不参与提醒。
 * 多套餐时只看第一个有效套餐（即卡片上主显的那一个），避免小额附赠套餐误触发。
 */
export function extractAlertBalance(
  data: UsageData[],
): { remaining: number; unit?: string } | null {
  for (const plan of data) {
    if (plan.isValid === false) continue;
    if (
      typeof plan.remaining === "number" &&
      Number.isFinite(plan.remaining) &&
      plan.remaining !== -1
    ) {
      return { remaining: plan.remaining, unit: plan.unit };
    }
  }
  return null;
}

/** 已提醒记录：key（`${appId}:${providerId}`）-> 提醒时刻（ms）。 */
export type BalanceAlertedKeys = Record<string, number>;

const STORAGE_KEY = "cc-switch:balance-alerted";

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadBalanceAlertState(
  storage: Storage | null = safeStorage(),
): BalanceAlertedKeys {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const cleaned: BalanceAlertedKeys = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

export function saveBalanceAlertState(
  state: BalanceAlertedKeys,
  storage: Storage | null = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默放弃：最坏情况是重启后重复提醒一次，不阻塞主流程。
  }
}

/**
 * 纯决策函数：给定当前剩余额度与已提醒记录，决定是否提醒、以及更新后的记录。
 * - 低于阈值且本轮未提醒过 -> 提醒，并记一笔。
 * - 低于阈值且已提醒过 -> 不提醒（同一轮低余额只报一次）。
 * - 回到阈值以上 -> 不提醒，并清除该供应商的记录（下次跌破重新提醒）。
 */
export function decideBalanceAlert(args: {
  key: string;
  remaining: number;
  threshold: number;
  alertedKeys: BalanceAlertedKeys;
  now: number;
}): { notify: boolean; nextAlertedKeys: BalanceAlertedKeys } {
  const { key, remaining, threshold, alertedKeys, now } = args;
  if (remaining >= threshold) {
    if (!(key in alertedKeys)) {
      return { notify: false, nextAlertedKeys: alertedKeys };
    }
    const next = { ...alertedKeys };
    delete next[key];
    return { notify: false, nextAlertedKeys: next };
  }
  if (key in alertedKeys) {
    return { notify: false, nextAlertedKeys: alertedKeys };
  }
  return { notify: true, nextAlertedKeys: { ...alertedKeys, [key]: now } };
}

/**
 * 发一条系统通知（走 tauri-plugin-notification）。
 * 动态 import：单元测试加载本模块时不会触及 Tauri 插件。
 * 权限不足时会请求一次；被拒或发送失败返回 false，绝不抛错。
 */
export async function sendLowBalanceNotification(
  title: string,
  body: string,
): Promise<boolean> {
  try {
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import("@tauri-apps/plugin-notification");
    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === "granted";
    }
    if (!granted) return false;
    sendNotification({ title, body });
    return true;
  } catch {
    return false;
  }
}
