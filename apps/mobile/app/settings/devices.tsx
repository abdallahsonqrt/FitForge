import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation } from '../../src/i18n';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Smartphone, Laptop, Trash2, MonitorSmartphone } from 'lucide-react-native';
import { ErrorState, SkeletonList } from '../../src/components/ui';
import { useDevices, useRemoveDevice, type Device } from '../../src/features/devices/api/useDevices';
import { useEntitlements } from '../../src/features/subscription/api/useSubscription';
import { formatDeviceLimit } from '../../src/features/subscription/types';
import { getApiErrorMessage } from '../../src/lib/api';
import { showAlert } from '../../src/lib/alert';
import { relativeDayLabel } from '../../src/utils/date';

const deviceIcon = (device: Device) => {
  const platform = (device.platform ?? '').toLowerCase();
  return platform === 'ios' || platform === 'android' ? Smartphone : Laptop;
};

const deviceLabel = (device: Device) =>
  device.deviceName ?? device.userAgent?.split(' ')[0] ?? 'Unknown device';

export default function DevicesScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const devices = useDevices();
  const removeDevice = useRemoveDevice();
  const entitlements = useEntitlements();

  // Free users get a single device; the limit comes from the plan they are on.
  const deviceLimit = entitlements.deviceLimit;
  const deviceCount = devices.data?.length ?? 0;

  const confirmRemove = (device: Device) => {
    showAlert(t('settings.devices.removeTitle'), `Sign ${deviceLabel(device)} out of FitForge?`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: () =>
          removeDevice.mutate(device.id, {
            onError: (error) => showAlert(t('settings.devices.removeFailed'), getApiErrorMessage(error)),
          }),
      },
    ]);
  };

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <View style={styles.summaryCard}>
        <MonitorSmartphone size={24} color={theme.colors.primary} />
        <View style={styles.summaryText}>
          <Text style={styles.summaryTitle}>
            {deviceCount} of {deviceLimit < 0 ? '∞' : deviceLimit} devices in use
          </Text>
          <Text style={styles.summarySubtitle}>{formatDeviceLimit(deviceLimit)} on your plan</Text>
        </View>
      </View>

      {devices.isLoading ? (
        <SkeletonList count={2} height={76} />
      ) : devices.isError ? (
        <ErrorState
          message={getApiErrorMessage(devices.error, 'Could not load your devices.')}
          onRetry={() => devices.refetch()}
        />
      ) : deviceCount === 0 ? (
        <Text style={styles.emptyText}>No devices registered yet.</Text>
      ) : (
        (devices.data ?? []).map((device) => {
          const Icon = deviceIcon(device);
          return (
            <View key={device.id} style={styles.deviceCard}>
              <View style={styles.iconContainer}>
                <Icon size={24} color={theme.colors.primary} />
              </View>
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>{deviceLabel(device)}</Text>
                <Text style={styles.lastActive}>
                  {device.platform ? `${device.platform} · ` : ''}
                  Active {relativeDayLabel(device.lastActive).toLowerCase()}
                </Text>
              </View>
              <Pressable
                style={styles.removeBtn}
                onPress={() => confirmRemove(device)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${deviceLabel(device)}`}
                hitSlop={8}
              >
                <Trash2 size={20} color={theme.colors.error} />
              </Pressable>
            </View>
          );
        })
      )}
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  content: {},
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surfaceElevated,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  summaryText: { flex: 1 },
  summaryTitle: { color: theme.colors.text, ...theme.typography.labelMd },
  summarySubtitle: { color: theme.colors.textSecondary, ...theme.typography.bodySm, marginTop: 2 },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  deviceInfo: { flex: 1 },
  deviceName: { color: theme.colors.text, ...theme.typography.labelMd },
  lastActive: { color: theme.colors.textSecondary, ...theme.typography.bodySm, marginTop: 2 },
  removeBtn: { padding: theme.spacing.sm },
  emptyText: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodyMd,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
  },
}));
