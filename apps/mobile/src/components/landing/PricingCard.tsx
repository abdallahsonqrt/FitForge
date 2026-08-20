import { Text, View } from 'react-native';
import { Check, Clock, MessageCircle, MessageCircleOff } from 'lucide-react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Button } from '../ui/Button';
import type { PricingPlan } from '../../data/landing';

type Props = { plan: PricingPlan; onPress: () => void };

/**
 * A membership tier on the landing page. Coach access sits above the feature
 * list, with the response expectation next to it, so what a human will actually
 * do for you is visible before anyone creates an account.
 */
export function PricingCard({ plan, onPress }: Props) {
  const { styles, theme } = useStyles(stylesheet);
  const hasCoach = plan.coachAccess !== 'No coach messaging';

  return (
    <View style={[styles.card, plan.popular && styles.popular]}>
      {/* The slot is reserved on every tier, popular or not, so tier names sit
          on one line when the cards stand side by side. */}
      <View style={styles.ribbonSlot}>
        {plan.popular && (
          <View style={styles.ribbon}>
            <Text style={styles.ribbonText}>Most popular</Text>
          </View>
        )}
      </View>

      <Text style={styles.name}>{plan.name}</Text>
      <View style={styles.priceRow}>
        <Text style={styles.price}>{plan.price}</Text>
        {plan.price !== '$0' && <Text style={styles.month}>/month</Text>}
      </View>
      <Text style={styles.priceNote}>Preview pricing</Text>
      <Text style={styles.description}>{plan.description}</Text>

      <View style={[styles.coachPanel, hasCoach && styles.coachPanelActive]}>
        <View style={styles.coachRow}>
          {hasCoach ? (
            <MessageCircle size={16} color={theme.colors.primary} />
          ) : (
            <MessageCircleOff size={16} color={theme.colors.textSecondary} />
          )}
          <Text style={[styles.coachAccess, hasCoach && styles.coachAccessActive]}>
            {plan.coachAccess}
          </Text>
        </View>
        <View style={styles.coachRow}>
          <Clock size={13} color={theme.colors.textSecondary} />
          <Text style={styles.responseExpectation}>{plan.responseExpectation}</Text>
        </View>
      </View>

      <View style={styles.features}>
        {plan.features.map((feature) => (
          <View key={feature} style={styles.feature}>
            <Check size={16} color={theme.colors.success} strokeWidth={3} />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      <Button
        title={plan.name === 'Free' ? 'Start exploring' : 'Create account'}
        onPress={onPress}
        variant={plan.popular ? 'primary' : 'outline'}
      />
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  // `flex: 1` lets a card fill its cell, so tiers sitting side by side in the
  // grid share one height instead of stepping down with their feature counts.
  card: { flex: 1, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.borderRadius.xl, padding: theme.spacing.xl },
  popular: { borderColor: theme.colors.primary, borderWidth: 2, ...theme.shadows.md },
  ribbonSlot: { minHeight: 26, justifyContent: 'center', marginBottom: theme.spacing.md },
  ribbon: { alignSelf: 'flex-start', backgroundColor: theme.colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.borderRadius.full },
  ribbonText: { ...theme.typography.labelSm, color: theme.colors.onPrimary },
  name: { ...theme.typography.headingLg, color: theme.colors.text },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: theme.spacing.sm },
  price: { ...theme.typography.displayLg, color: theme.colors.text },
  month: { ...theme.typography.bodySm, color: theme.colors.textSecondary },
  priceNote: { ...theme.typography.labelSm, color: theme.colors.textSecondary, textTransform: 'uppercase', marginTop: 2 },
  description: { ...theme.typography.bodySm, lineHeight: 18, color: theme.colors.textSecondary, marginTop: theme.spacing.sm, minHeight: 36 },
  coachPanel: { borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md, gap: theme.spacing.sm, marginTop: theme.spacing.md },
  coachPanelActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  coachRow: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' },
  coachAccess: { ...theme.typography.labelMd, color: theme.colors.textSecondary, flex: 1 },
  coachAccessActive: { color: theme.colors.text },
  responseExpectation: { ...theme.typography.bodySm, lineHeight: 18, color: theme.colors.textSecondary, flex: 1 },
  // Growing the feature list pushes the CTA to the bottom edge, so the buttons
  // of neighbouring tiers line up on one row.
  features: { flexGrow: 1, gap: theme.spacing.sm, marginVertical: theme.spacing.lg },
  feature: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' },
  featureText: { ...theme.typography.bodySm, color: theme.colors.text },
}));
