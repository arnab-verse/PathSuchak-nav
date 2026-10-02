import { useState, useEffect } from 'react';

export interface DeviceBatteryState {
  level: number; // 0 to 100
  isCharging: boolean;
  chargingTime: number | null;
  dischargingTime: number | null;
  isSupported: boolean;
  statusLabel: string;
}

export function useDeviceBattery(): DeviceBatteryState {
  const [batteryState, setBatteryState] = useState<DeviceBatteryState>({
    level: 88,
    isCharging: false,
    chargingTime: null,
    dischargingTime: null,
    isSupported: false,
    statusLabel: 'Good'
  });

  useEffect(() => {
    let batteryObj: any = null;

    const getStatusLabel = (level: number, isCharging: boolean) => {
      if (isCharging) return 'Charging';
      if (level > 70) return 'Optimal';
      if (level > 30) return 'Good';
      if (level > 15) return 'Low Battery';
      return 'Critical';
    };

    const updateBatteryInfo = (battery: any) => {
      const level = Math.round((battery.level || 1) * 100);
      const isCharging = Boolean(battery.charging);
      const statusLabel = getStatusLabel(level, isCharging);

      setBatteryState({
        level,
        isCharging,
        chargingTime: battery.chargingTime || null,
        dischargingTime: battery.dischargingTime || null,
        isSupported: true,
        statusLabel
      });
    };

    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      (navigator as any)
        .getBattery()
        .then((battery: any) => {
          batteryObj = battery;
          updateBatteryInfo(battery);

          battery.addEventListener('levelchange', () => updateBatteryInfo(battery));
          battery.addEventListener('chargingchange', () => updateBatteryInfo(battery));
          battery.addEventListener('chargingtimechange', () => updateBatteryInfo(battery));
          battery.addEventListener('dischargingtimechange', () => updateBatteryInfo(battery));
        })
        .catch(() => {
          // If battery API promise rejects or blocked in iframe permissions, fallback gracefully
          setBatteryState({
            level: 88,
            isCharging: false,
            chargingTime: null,
            dischargingTime: null,
            isSupported: false,
            statusLabel: 'Good'
          });
        });
    } else {
      setBatteryState({
        level: 88,
        isCharging: false,
        chargingTime: null,
        dischargingTime: null,
        isSupported: false,
        statusLabel: 'Good'
      });
    }

    return () => {
      if (batteryObj) {
        try {
          batteryObj.removeEventListener('levelchange', () => {});
          batteryObj.removeEventListener('chargingchange', () => {});
        } catch {}
      }
    };
  }, []);

  return batteryState;
}
