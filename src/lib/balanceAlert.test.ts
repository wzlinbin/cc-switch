import { describe, it, expect } from "vitest";
import {
  DEFAULT_BALANCE_ALERT_THRESHOLD,
  decideBalanceAlert,
  extractAlertBalance,
  loadBalanceAlertState,
  resolveBalanceAlertSettings,
  saveBalanceAlertState,
} from "./balanceAlert";
import type { Settings, UsageData } from "@/types";

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe("resolveBalanceAlertSettings", () => {
  it("缺设置时默认开启、阈值 5", () => {
    expect(resolveBalanceAlertSettings(undefined)).toEqual({
      enabled: true,
      threshold: 5,
    });
    expect(resolveBalanceAlertSettings({} as Settings)).toEqual({
      enabled: true,
      threshold: 5,
    });
  });

  it("读设置里的开关与阈值", () => {
    expect(
      resolveBalanceAlertSettings({
        balanceAlertEnabled: false,
        balanceAlertThreshold: 10,
      } as Settings),
    ).toEqual({ enabled: false, threshold: 10 });
  });

  it("非法阈值回落到默认值 5", () => {
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        resolveBalanceAlertSettings({ balanceAlertThreshold: bad } as Settings)
          .threshold,
      ).toBe(DEFAULT_BALANCE_ALERT_THRESHOLD);
    }
  });
});

describe("extractAlertBalance", () => {
  it("取第一个有效套餐的剩余额度", () => {
    const data: UsageData[] = [
      { planName: "主套餐", remaining: 3.2, unit: "USD" },
      { planName: "附赠", remaining: 100 },
    ];
    expect(extractAlertBalance(data)).toEqual({
      remaining: 3.2,
      unit: "USD",
    });
  });

  it("跳过失效套餐与无限额度（-1）", () => {
    const data: UsageData[] = [
      { planName: "过期", remaining: 1, isValid: false },
      { planName: "无限", remaining: -1 },
      { planName: "正常", remaining: 8 },
    ];
    expect(extractAlertBalance(data)).toEqual({
      remaining: 8,
      unit: undefined,
    });
  });

  it("没有剩余额度时返回 null", () => {
    expect(extractAlertBalance([{ used: 10 }])).toBeNull();
    expect(extractAlertBalance([])).toBeNull();
  });
});

describe("decideBalanceAlert", () => {
  const key = "claude:provider-1";

  it("首次跌破阈值提醒一次", () => {
    const { notify, nextAlertedKeys } = decideBalanceAlert({
      key,
      remaining: 4.99,
      threshold: 5,
      alertedKeys: {},
      now: 1000,
    });
    expect(notify).toBe(true);
    expect(nextAlertedKeys).toEqual({ [key]: 1000 });
  });

  it("同一轮低余额不再重复提醒", () => {
    const { notify, nextAlertedKeys } = decideBalanceAlert({
      key,
      remaining: 2,
      threshold: 5,
      alertedKeys: { [key]: 1000 },
      now: 2000,
    });
    expect(notify).toBe(false);
    expect(nextAlertedKeys).toEqual({ [key]: 1000 });
  });

  it("余额恢复到阈值以上时清除记录", () => {
    const { notify, nextAlertedKeys } = decideBalanceAlert({
      key,
      remaining: 5,
      threshold: 5,
      alertedKeys: { [key]: 1000 },
      now: 3000,
    });
    expect(notify).toBe(false);
    expect(nextAlertedKeys).toEqual({});
  });

  it("恢复后再跌破会再次提醒", () => {
    const cleared = decideBalanceAlert({
      key,
      remaining: 10,
      threshold: 5,
      alertedKeys: { [key]: 1000 },
      now: 3000,
    }).nextAlertedKeys;
    expect(
      decideBalanceAlert({
        key,
        remaining: 1,
        threshold: 5,
        alertedKeys: cleared,
        now: 4000,
      }).notify,
    ).toBe(true);
  });

  it("不同供应商互不影响", () => {
    const { nextAlertedKeys } = decideBalanceAlert({
      key: "claude:provider-2",
      remaining: 1,
      threshold: 5,
      alertedKeys: { [key]: 1000 },
      now: 2000,
    });
    expect(nextAlertedKeys).toEqual({ [key]: 1000, "claude:provider-2": 2000 });
  });
});

describe("balance alert state storage", () => {
  it("保存与读取往返一致", () => {
    const storage = fakeStorage();
    saveBalanceAlertState({ "claude:p1": 123 }, storage);
    expect(loadBalanceAlertState(storage)).toEqual({ "claude:p1": 123 });
  });

  it("损坏或非法内容读出为空", () => {
    expect(
      loadBalanceAlertState(fakeStorage({ "cc-switch:balance-alerted": "{" })),
    ).toEqual({});
    expect(
      loadBalanceAlertState(
        fakeStorage({
          "cc-switch:balance-alerted": JSON.stringify({ a: "x", b: 7 }),
        }),
      ),
    ).toEqual({ b: 7 });
  });
});
