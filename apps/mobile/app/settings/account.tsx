import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation } from '../../src/i18n';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { MonitorSmartphone, ChevronRight } from 'lucide-react-native';
import { Avatar, Button, Input, Skeleton } from '../../src/components/ui';
import { useMe, useUpdateProfile } from '../../src/features/users/api/useMe';
import { useDevices } from '../../src/features/devices/api/useDevices';
import { useEntitlements } from '../../src/features/subscription/api/useSubscription';
import { getApiErrorMessage } from '../../src/lib/api';
import { showAlert } from '../../src/lib/alert';
import { displayName } from '../../src/features/users/types';
import { nameValidator } from '../../src/utils/validators';

export default function AccountSettingsScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  const me = useMe();
  const updateProfile = useUpdateProfile();
  const devices = useDevices();
  const entitlements = useEntitlements();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string }>({});

  // Seed the form once the profile lands, and re-seed if it is refetched.
  useEffect(() => {
    if (me.data) {
      setFirstName(me.data.firstName ?? '');
      setLastName(me.data.lastName ?? '');
    }
  }, [me.data]);

  const isDirty =
    !!me.data && (firstName !== (me.data.firstName ?? '') || lastName !== (me.data.lastName ?? ''));

  const save = () => {
    const nextErrors: typeof errors = {};
    const first = nameValidator.safeParse(firstName.trim());
    if (!first.success) nextErrors.firstName = first.error.issues[0].message;
    const last = nameValidator.safeParse(lastName.trim());
    if (!last.success) nextErrors.lastName = last.error.issues[0].message;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    updateProfile.mutate(
      { firstName: firstName.trim(), lastName: lastName.trim() },
      {
        onSuccess: () => showAlert(t('common.saved'), t('settings.account.savedMessage')),
        onError: (error) => showAlert(t('settings.account.saveFailed'), getApiErrorMessage(error)),
      },
    );
  };

  const deviceLimit = entitlements.deviceLimit;
  const deviceCount = devices.data?.length ?? 0;

  if (me.isLoading) {
    return (
      <ScreenContainer contentContainerStyle={styles.content}>
        <Skeleton height={120} />
        <Skeleton height={220} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <View style={styles.avatarSection}>
        <Avatar
          name={displayName(me.data) || '?'}
          url={me.data?.avatarUrl ?? undefined}
          size={88}
        />
        <Text style={styles.emailText}>{me.data?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile Information</Text>
        <Input
          label="First Name"
          value={firstName}
          onChangeText={(value) => {
            setFirstName(value);
            setErrors((prev) => ({ ...prev, firstName: undefined }));
          }}
          error={errors.firstName}
          autoComplete="given-name"
        />
        <Input
          label="Last Name"
          value={lastName}
          onChangeText={(value) => {
            setLastName(value);
            setErrors((prev) => ({ ...prev, lastName: undefined }));
          }}
          error={errors.lastName}
          autoComplete="family-name"
        />
        <Input label="Email Address" value={me.data?.email ?? ''} editable={false} />
        <Text style={styles.hint}>Email cannot be changed from the app.</Text>

        <Button
          title="Save changes"
          onPress={save}
          disabled={!isDirty}
          loading={updateProfile.isPending}
          style={styles.saveButton}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Devices</Text>
        <Button
          title={`${deviceCount} of ${deviceLimit < 0 ? 'unlimited' : deviceLimit} devices in use`}
          variant="outline"
          icon={<MonitorSmartphone size={20} color={theme.colors.primary} />}
          onPress={() => router.push('/settings/devices')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subscription</Text>
        <Button
          title={`Manage your ${entitlements.planName} plan`}
          variant="outline"
          icon={<ChevronRight size={20} color={theme.colors.primary} />}
          onPress={() => router.push('/subscription')}
        />
      </View>
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  content: { gap: theme.spacing.xl },
  avatarSection: { alignItems: 'center', gap: theme.spacing.md, marginTop: theme.spacing.md },
  emailText: { color: theme.colors.textSecondary, ...theme.typography.bodyMd },
  section: { gap: theme.spacing.sm },
  sectionTitle: {
    color: theme.colors.textSecondary,
    ...theme.typography.labelSm,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.xs,
  },
  hint: { color: theme.colors.textSecondary, ...theme.typography.bodyXs },
  saveButton: { marginTop: theme.spacing.md },
}));
