import React from 'react';
import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Check, Clock, MessageCircle, MessageCircleOff, Video, Zap } from 'lucide-react-native';
import { Button } from '../ui';
import {
  COACH_ACCESS_HEADLINE,
  formatPrice,
  TIER_INCLUDES,
  type Entitlements,
} from '../../features/subscription/types';

interface PlanCardProps {
  name: string;
  /** The plan's resolved entitlements, straight from the API. */
  entitlements: Entitlements;
  isCurrent?: boolean;
  isPopular?: boolean;
  /** Omitted for plans that cannot be selected from here (downgrades). */
  onSelect?: () => void;
  selecting?: boolean;
  unavailableNote?: string;
}

/**
 * A tier on the paywall.
 *
 * Coach access is the headline, not a line item: the spec asks for the exact
 * coach service and the response expectation to be visible before purchase, so
 * both sit above the feature list rather than inside it.
 */
export const PlanCard: React.FC<PlanCardProps> = ({
  name,
  entitlements,
  isCurrent,
  isPopular,
  onSelect,
  selecting,
  unavailableNote,
}) => {
  const { styles, theme } = useStyles(stylesheet);
  const hasCoach = entitlements.coachAccess !== 'none';

  return (
    <View
      style={[
        styles.container,
        isPopular && styles.containerPopular,
        isCurrent && styles.containerCurrent,
      ]}
    >
      {isPopular && !isCurrent && (
        <View style={styles.popularBadge}>
          <Zap size={11} color={theme.colors.onPrimary} />
          <Text style={styles.popularText}>Most popular</Text>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.tierName}>{name}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPrice(entitlements.priceCents)}</Text>
          {entitlements.priceCents > 0 && <Text style={styles.period}>/month</Text>}
        </View>
        <Text style={styles.priceNote}>Preview pricing</Text>
      </View>

      {/* The differentiator: what a human does for you at this tier. */}
      <View style={[styles.coachPanel, hasCoach && styles.coachPanelActive]}>
        <View style={styles.coachHeadlineRow}>
          {hasCoach ? (
            <MessageCircle size={16} color={theme.colors.primary} />
          ) : (
            <MessageCircleOff size={16} color={theme.colors.textSecondary} />
          )}
          <Text style={[styles.coachHeadline, hasCoach && styles.coachHeadlineActive]}>
            {COACH_ACCESS_HEADLINE[entitlements.coachAccess]}
          </Text>
        </View>

        <View style={styles.coachDetailRow}>
          <Clock size={13} color={theme.colors.textSecondary} />
          <Text style={styles.coachDetail}>{entitlements.coachResponseExpectation}</Text>
        </View>

        {entitlements.formReviews && (
          <View style={styles.coachDetailRow}>
            <Video size={13} color={theme.colors.textSecondary} />
            <Text style={styles.coachDetail}>
              Send a training video and get a written form review back from your coach.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.featuresList}>
        {TIER_INCLUDES[entitlements.canonicalTier].map((feature) => (
          <View key={feature} style={styles.featureItem}>
            <Check size={16} color={isPopular ? theme.colors.primary : theme.colors.success} />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      {isCurrent ? (
        <View style={styles.currentPill}>
          <Text style={styles.currentPillText}>Your current plan</Text>
        </View>
      ) : onSelect ? (
        <Button
          title={entitlements.priceCents === 0 ? 'Start exploring' : `Choose ${name}`}
          variant={isPopular ? 'primary' : 'outline'}
          onPress={onSelect}
          loading={selecting}
          style={styles.button}
        />
      ) : (
        <Text style={styles.unavailableNote}>{unavailableNote}</Text>
      )}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.xl,
    position: 'relative',
  },
  containerPopular: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceElevated,
    shadowColor: theme.colors.primaryGlow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  containerCurrent: {
    backgroundColor: theme.colors.surfaceElevated,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  popularText: {
    ...theme.typography.labelSm,
    color: theme.colors.onPrimary,
    textTransform: 'uppercase',
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  tierName: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    ...theme.typography.displayLg,
    color: theme.colors.text,
  },
  period: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
  },
  priceNote: {
    ...theme.typography.labelSm,
    color: theme.colors.textSecondary,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  coachPanel: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  coachPanelActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  coachHeadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  coachHeadline: {
    ...theme.typography.labelMd,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  coachHeadlineActive: {
    color: theme.colors.text,
  },
  coachDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  coachDetail: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    flex: 1,
  },
  featuresList: {
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  featureText: {
    ...theme.typography.bodyMd,
    color: theme.colors.text,
    flex: 1,
  },
  currentPill: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  currentPillText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
  },
  unavailableNote: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: theme.spacing.md,
  },
  button: {
    width: '100%',
  },
}));
