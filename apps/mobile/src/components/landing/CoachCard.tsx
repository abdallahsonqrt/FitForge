import { Pressable, Text, View } from 'react-native';
import { Star, ArrowUpRight } from 'lucide-react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { Coach } from '../../data/landing';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  coach: Coach;
  onPress: () => void;
  /** Set by the carousel so card width and snap interval stay in step. */
  width: number;
};

export function CoachCard({ coach, onPress, width }: Props) {
  const { styles, theme } = useStyles(stylesheet);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 300 });
      }}
      accessibilityRole="button"
      accessibilityLabel={`View ${coach.name}'s profile`}
      style={[styles.card, { width }, animatedStyle]}
    >
      <View style={styles.top}>
        <View style={[styles.avatar, { backgroundColor: coach.avatarColors[0] }]}>
          <View style={[styles.avatarAccent, { backgroundColor: coach.avatarColors[1] }]} />
          <Text style={styles.avatarText}>{coach.initials}</Text>
        </View>
        <View style={styles.rating}>
          <Star size={13} fill={theme.colors.warning} color={theme.colors.warning} />
          <Text style={styles.ratingText}>{coach.rating}</Text>
        </View>
      </View>

      <Text style={styles.name}>{coach.name}</Text>
      <Text style={styles.specialty}>{coach.specialty}</Text>
      <Text style={styles.experience}>{coach.experience}</Text>

      <View style={styles.tags}>
        {coach.tags.map((tag) => (
          <View style={styles.tag} key={tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.description}>{coach.description}</Text>

      <View style={styles.bottom}>
        <Text style={styles.price}>{coach.price}</Text>
        <View style={styles.profileAction}>
          <Text style={styles.profileText}>View profile</Text>
          <ArrowUpRight size={16} color={theme.colors.primary} />
        </View>
      </View>
    </AnimatedPressable>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.md },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarAccent: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    right: -18,
    bottom: -16,
    opacity: 0.85,
  },
  avatarText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: theme.colors.warningSoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.full,
  },
  ratingText: { ...theme.typography.labelSm, color: theme.colors.text },
  name: { ...theme.typography.headingLg, color: theme.colors.text },
  specialty: { ...theme.typography.bodySm, color: theme.colors.primary, marginTop: 3 },
  experience: { ...theme.typography.bodySm, color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: theme.spacing.md },
  tag: {
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.full,
  },
  tagText: { ...theme.typography.bodyXs, color: theme.colors.textSecondary },
  description: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginTop: theme.spacing.md,
    minHeight: 54,
  },
  bottom: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  price: { ...theme.typography.labelSm, color: theme.colors.text },
  profileAction: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  profileText: { ...theme.typography.labelSm, color: theme.colors.primary },
}));
