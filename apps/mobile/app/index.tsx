import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AnimatePresence, MotiView } from 'moti';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Dumbbell,
  Menu,
  Sparkles,
  Target,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/store/authStore';
import { homeHrefFor } from '../src/lib/routing';
import { useTranslation } from '../src/i18n';
import { featuredCoaches, pricingDisclaimer, pricingPlans } from '../src/data/landing';
import { CoachCard } from '../src/components/landing/CoachCard';
import { PricingCard } from '../src/components/landing/PricingCard';
import { Reveal, ScrollOffsetProvider } from '../src/components/landing/Reveal';
import {
  CONTENT_MAX_WIDTH,
  NAV_HEIGHT,
  useLandingLayout,
  type LandingLayout,
} from '../src/components/landing/useLandingLayout';
import { Button } from '../src/components/ui/Button';

type Anchor = 'how' | 'coaches' | 'plans';

const BENEFITS: { icon: LucideIcon; title: string; copy: string }[] = [
  { icon: Target, title: 'Personalized plans', copy: 'Training shaped around your goal and gear.' },
  { icon: Users, title: 'Real coach guidance', copy: 'Expert support from people who know your sport.' },
  { icon: Bot, title: 'AI daily support', copy: 'Easy check-ins for workouts, nutrition, and progress.' },
];

const STEPS = [
  { number: '01', title: 'Tell us what you need', copy: 'Share your goal, sport, experience, and available equipment.' },
  { number: '02', title: 'Meet your match', copy: 'Choose a coach and program that fit the way you train.' },
  { number: '03', title: 'Train with support', copy: 'Track progress, stay accountable, and get help when you need it.' },
];

const PREVIEW_EXERCISES = [
  { name: 'Assisted pull-ups', sets: '3 × 6', done: true },
  { name: 'Elevated push-ups', sets: '3 × 10', done: true },
  { name: 'Band face pulls', sets: '3 × 12', done: false },
];

export default function Index() {
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const onboarded = useAuthStore((state) => state.isOnboarded);
  const user = useAuthStore((state) => state.user);
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const layout = useLandingLayout();
  /**
   * This screen sets `headerShown: false` and does not use `ScreenContainer`,
   * so nothing else supplies the insets: the sticky nav rendered under the
   * status bar and notch, and the footer under the home indicator.
   */
  const insets = useSafeAreaInsets();

  const scrollRef = useRef<ScrollView>(null);
  // Anchors live in a ref, not state: they are read when a nav link is tapped
  // and never rendered, so measuring them should not re-render the page.
  const anchors = useRef<Record<Anchor, number>>({ how: 0, coaches: 0, plans: 0 });
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollY = useSharedValue(0);
  const scrollRange = useSharedValue(1);
  const navWidth = useSharedValue(0);

  // The nav sits flat on the hero and only earns its separator once content has
  // scrolled underneath it.
  const dividerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(scrollY.value > 4 ? 1 : 0, { duration: 160 }),
  }));

  const progressStyle = useAnimatedStyle(() => {
    const ratio = Math.min(Math.max(scrollY.value / scrollRange.value, 0), 1);
    return { width: navWidth.value * ratio };
  });

  /**
   * Signed-in visitors are no longer redirected away.
   *
   * This page is also the only place coaches and plans are browsable, so
   * bouncing an authenticated user off it meant they could never read the very
   * things it exists to show. The nav swaps its sign-up calls to action for a
   * way back into the app instead — see `openApp` below.
   */

  const register = () => router.push('/(auth)/register');
  const login = () => router.push('/(auth)/login');
  /** Back into the app, at whichever home this account belongs to. */
  const openApp = () => router.push(homeHrefFor(user, onboarded));

  const goTo = (anchor: Anchor | 'top') => {
    setMenuOpen(false);
    // The nav floats above the content, so land the section below it instead of
    // scrolling its heading behind it.
    const y = anchor === 'top' ? 0 : Math.max(anchors.current[anchor] - NAV_HEIGHT, 0);
    scrollRef.current?.scrollTo({ y, animated: true });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    scrollY.value = contentOffset.y;
    scrollRange.value = Math.max(contentSize.height - layoutMeasurement.height, 1);
  };

  const pricingGap = theme.spacing.lg;
  const pricingCellWidth =
    layout.pricingColumns === 1
      ? undefined
      : Math.floor(
          (Math.min(layout.width, CONTENT_MAX_WIDTH) -
            layout.gutter * 2 -
            pricingGap * (layout.pricingColumns - 1)) /
            layout.pricingColumns,
        );

  return (
    <ScrollOffsetProvider value={scrollY}>
      <ScrollView
        ref={scrollRef}
        style={styles.screen}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        <View
          style={[styles.navWrap, { paddingTop: insets.top }]}
          onLayout={(event) => {
            navWidth.value = event.nativeEvent.layout.width;
          }}
        >
          <View style={styles.nav(layout.gutter)}>
            <Pressable
              onPress={() => goTo('top')}
              style={({ pressed }) => [styles.brand, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="FitForge home"
            >
              <View style={styles.logo}>
                <Dumbbell size={18} color={theme.colors.onPrimary} />
              </View>
              <Text style={styles.brandText}>FitForge</Text>
            </Pressable>

            {layout.showInlineNav ? (
              <View style={styles.inlineNav}>
                <NavLink label="How it works" onPress={() => goTo('how')} />
                <NavLink label="Coaches" onPress={() => goTo('coaches')} />
                <NavLink label="Plans" onPress={() => goTo('plans')} />
                {authenticated ? (
                  <Button title={t('landing.openApp')} size="sm" onPress={openApp} />
                ) : (
                  <>
                    <Pressable
                      onPress={login}
                      style={({ pressed }) => pressed && styles.pressed}
                      accessibilityRole="button"
                    >
                      <Text style={styles.login}>Log in</Text>
                    </Pressable>
                    <Button title="Create account" size="sm" onPress={register} />
                  </>
                )}
              </View>
            ) : (
              <Pressable
                onPress={() => setMenuOpen((open) => !open)}
                style={styles.menuButton}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Toggle navigation menu"
                accessibilityState={{ expanded: menuOpen }}
              >
                {menuOpen ? <X color={theme.colors.text} /> : <Menu color={theme.colors.text} />}
              </Pressable>
            )}
          </View>

          <AnimatePresence>
            {menuOpen && !layout.showInlineNav && (
              <MotiView
                key="menu"
                from={{ opacity: 0, translateY: -10 }}
                animate={{ opacity: 1, translateY: 0 }}
                exit={{ opacity: 0, translateY: -10 }}
                transition={{ type: 'timing', duration: 180 }}
                style={styles.mobileMenu}
              >
                <MobileLink label="How it works" onPress={() => goTo('how')} />
                <MobileLink label="Coaches" onPress={() => goTo('coaches')} />
                <MobileLink label="Plans" onPress={() => goTo('plans')} />
                {authenticated ? (
                  <Button title={t('landing.openApp')} onPress={openApp} />
                ) : (
                  <>
                    <Button title="Log in" onPress={login} variant="outline" />
                    <Button title="Create account" onPress={register} />
                  </>
                )}
              </MotiView>
            )}
          </AnimatePresence>

          <Animated.View style={[styles.navDivider, dividerStyle]} />
          <Animated.View style={[styles.navProgress, progressStyle]} />
        </View>

        <Reveal group style={styles.hero(layout)}>
          <View style={styles.heroText(layout.isDesktop)}>
            <Reveal delay={40} style={styles.eyebrow}>
              <Sparkles size={15} color={theme.colors.secondary} />
              <Text style={styles.eyebrowText}>Coaching that fits real life</Text>
            </Reveal>

            <Reveal delay={110}>
              <Text style={styles.heroTitle(layout.heroTitleSize)}>
                Train with a plan{layout.isTablet ? '\n' : ' '}made for{' '}
                <Text style={styles.highlight}>you.</Text>
              </Text>
            </Reveal>

            <Reveal delay={180}>
              <Text style={styles.heroCopy}>
                Find the coach and program that match your goals, sport, equipment, and
                schedule—then let AI make daily progress feel simple.
              </Text>
            </Reveal>

            <Reveal delay={250} style={styles.heroActions(layout.isTablet)}>
              <Button
                title="Find your coach"
                size="lg"
                onPress={register}
                icon={<ArrowRight size={18} color={theme.colors.onPrimary} />}
              />
              <Button
                title="Explore coaches"
                size="lg"
                variant="outline"
                onPress={() => goTo('coaches')}
              />
            </Reveal>

            <Reveal delay={320} style={styles.socialProof}>
              <View style={styles.faceStack}>
                <View style={[styles.face, { backgroundColor: '#F97316' }]} />
                <View style={[styles.face, { backgroundColor: '#10B981' }]} />
                <View style={[styles.face, { backgroundColor: '#EC4899' }]} />
              </View>
              <Text style={styles.socialText}>
                Built for people who want a plan, not more noise.
              </Text>
            </Reveal>
          </View>

          <Reveal delay={300} style={styles.heroPreview(layout.isDesktop)}>
            <WorkoutPreview />
          </Reveal>
        </Reveal>

        <Reveal group style={styles.band}>
          <View style={styles.benefits(layout)}>
            {BENEFITS.map((benefit, index) => (
              <Reveal
                key={benefit.title}
                delay={index * 90}
                style={styles.benefitCell(layout.isTablet)}
              >
                <Benefit {...benefit} stacked={layout.isTablet} />
              </Reveal>
            ))}
          </View>
        </Reveal>

        <Reveal
          group
          style={styles.section(layout)}
          onMeasure={(y) => {
            anchors.current.how = y;
          }}
        >
          <Reveal>
            <Text style={styles.kicker}>How it works</Text>
            <Text style={styles.sectionTitle(layout.isDesktop)}>
              A better plan starts with knowing you.
            </Text>
          </Reveal>
          <View style={styles.steps(layout.isWide)}>
            {STEPS.map((step, index) => (
              <Reveal
                key={step.number}
                delay={120 + index * 90}
                style={styles.stepCell(layout.isWide)}
              >
                <Step {...step} inRow={layout.isWide} />
              </Reveal>
            ))}
          </View>
        </Reveal>

        <Reveal
          group
          style={styles.band}
          onMeasure={(y) => {
            anchors.current.coaches = y;
          }}
        >
          <Reveal style={styles.bandHeader(layout)}>
            <Text style={styles.kicker}>Meet your people</Text>
            <Text style={styles.sectionTitle(layout.isDesktop)}>
              Guidance from coaches who get your goal.
            </Text>
            <Text style={styles.sectionCopy}>
              Explore a few of the specialists ready to help you build momentum.
            </Text>
          </Reveal>
          <Reveal delay={140}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToAlignment="start"
              snapToInterval={layout.coachCardWidth + theme.spacing.md}
              contentContainerStyle={styles.coachList(layout)}
            >
              {featuredCoaches.map((coach) => (
                <CoachCard
                  key={coach.id}
                  coach={coach}
                  width={layout.coachCardWidth}
                  onPress={() => router.push(`/coaches/${coach.id}`)}
                />
              ))}
            </ScrollView>
          </Reveal>
        </Reveal>

        <Reveal
          group
          style={styles.section(layout)}
          onMeasure={(y) => {
            anchors.current.plans = y;
          }}
        >
          <Reveal>
            <Text style={styles.kicker}>Simple membership</Text>
            <Text style={styles.sectionTitle(layout.isDesktop)}>
              Start where you are. Grow when you’re ready.
            </Text>
          </Reveal>

          <View style={styles.pricingGrid(pricingGap)}>
            {pricingPlans.map((plan, index) => (
              <Reveal
                key={plan.name}
                delay={120 + index * 80}
                style={[styles.pricingCell, pricingCellWidth ? { width: pricingCellWidth } : null]}
              >
                <PricingCard plan={plan} onPress={register} />
              </Reveal>
            ))}
          </View>

          <Reveal delay={160}>
            <Text style={styles.note}>{pricingDisclaimer}</Text>
            <Text style={styles.note}>
              Some premium coaches offer optional higher-touch services when you want more
              one-to-one support.
            </Text>
          </Reveal>
        </Reveal>

        <Reveal style={styles.final(layout)}>
          <Sparkles size={22} color={theme.colors.secondary} />
          <Text style={styles.finalTitle(layout.isDesktop)}>
            Your next training plan can feel personal.
          </Text>
          <Text style={styles.finalCopy(layout.isTablet)}>
            Choose your direction, find an expert coach, and make every session count.
          </Text>
          <Button
            title="Create your account"
            size="lg"
            onPress={register}
            icon={<ArrowRight size={18} color={theme.colors.onPrimary} />}
          />
        </Reveal>

        <Reveal group style={[styles.footer, { paddingBottom: theme.spacing['2xl'] + insets.bottom }]}>
          <View style={styles.footerInner(layout.gutter, layout.isTablet)}>
            <View style={styles.footerBrandBlock}>
              <Text style={styles.footerBrand}>FitForge</Text>
              <Text style={styles.footerCopy}>Expert coaching. AI support. Your pace.</Text>
            </View>
            <View style={styles.footerLinks}>
              {['Product', 'Support', 'Contact', 'Privacy'].map((link) => (
                <Text key={link} style={styles.footerLink}>
                  {link}
                </Text>
              ))}
            </View>
          </View>
          <Text style={styles.copyright}>© 2026 FitForge. Built for your next rep.</Text>
        </Reveal>
      </ScrollView>
    </ScrollOffsetProvider>
  );
}

function NavLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { styles } = useStyles(stylesheet);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
      accessibilityRole="button"
    >
      <Text style={styles.navLink}>{label}</Text>
    </Pressable>
  );
}

function MobileLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { styles } = useStyles(stylesheet);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.mobileLinkRow, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Text style={styles.mobileLink}>{label}</Text>
    </Pressable>
  );
}

function Benefit({
  icon: Icon,
  title,
  copy,
  stacked,
}: {
  icon: LucideIcon;
  title: string;
  copy: string;
  /** Icon above the text once the three benefits sit side by side. */
  stacked: boolean;
}) {
  const { styles, theme } = useStyles(stylesheet);
  return (
    <View style={styles.benefit(stacked)}>
      <View style={styles.benefitIcon}>
        <Icon size={22} color={theme.colors.secondary} />
      </View>
      <View style={styles.benefitText}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitCopy}>{copy}</Text>
      </View>
    </View>
  );
}

function Step({
  number,
  title,
  copy,
  inRow,
}: {
  number: string;
  title: string;
  copy: string;
  /** Stacked steps get the full column, so only cap the line length in a row. */
  inRow: boolean;
}) {
  const { styles } = useStyles(stylesheet);
  return (
    <View style={styles.step}>
      <Text style={styles.stepNumber}>{number}</Text>
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepCopy(inRow)}>{copy}</Text>
      </View>
    </View>
  );
}

function WorkoutPreview() {
  const { styles, theme } = useStyles(stylesheet);
  return (
    <View style={styles.workoutCard}>
      <View style={styles.previewHeader}>
        <View style={styles.previewHeading}>
          <Text style={styles.previewOverline}>TODAY’S WORKOUT</Text>
          <Text style={styles.previewTitle}>Upper body strength</Text>
        </View>
        <View style={styles.coachMini}>
          <View style={styles.miniAvatar}>
            <Text style={styles.miniAvatarText}>JM</Text>
          </View>
          <Text style={styles.coachMiniText}>Jake</Text>
        </View>
      </View>

      <View style={styles.progressLine}>
        <View style={styles.progressFill} />
      </View>
      <Text style={styles.progressText}>2 of 4 exercises complete</Text>

      {PREVIEW_EXERCISES.map((exercise, index) => (
        <View key={exercise.name} style={styles.exercise}>
          <View style={[styles.check, exercise.done && styles.complete]}>
            {exercise.done ? (
              <CheckCircle2 size={14} color={theme.colors.onPrimary} />
            ) : (
              <Text style={styles.exerciseNo}>{index + 1}</Text>
            )}
          </View>
          <Text style={[styles.exerciseName, exercise.done && styles.done]}>{exercise.name}</Text>
          <Text style={styles.exerciseSets}>{exercise.sets}</Text>
        </View>
      ))}

      <View style={styles.aiInsight}>
        <Bot size={18} color={theme.colors.secondary} />
        <View style={styles.insightContent}>
          <Text style={styles.insightTitle}>AI insight</Text>
          <Text style={styles.insightText}>
            You’re trending ahead of last week—keep your rest to 60 seconds today.
          </Text>
        </View>
      </View>
    </View>
  );
}

/** One definition of the page's reading column, so every band lines up. */
const centered = (gutter: number) =>
  ({
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: gutter,
  }) as const;

const stylesheet = createStyleSheet((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  pressed: { opacity: 0.6 },

  navWrap: { backgroundColor: theme.colors.background, zIndex: 2 },
  nav: (gutter: number) => ({
    ...centered(gutter),
    height: NAV_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  }),
  navDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: theme.colors.border,
    pointerEvents: 'none',
  },
  navProgress: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 2,
    backgroundColor: theme.colors.primary,
    pointerEvents: 'none',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  logo: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { ...theme.typography.headingLg, color: theme.colors.text },
  inlineNav: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg },
  navLink: { ...theme.typography.labelSm, color: theme.colors.textSecondary },
  login: { ...theme.typography.labelSm, color: theme.colors.text },
  menuButton: { padding: theme.spacing.sm },
  mobileMenu: {
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  mobileLinkRow: { paddingVertical: theme.spacing.sm },
  mobileLink: { ...theme.typography.labelLg, color: theme.colors.text },

  hero: (layout: LandingLayout) => ({
    ...centered(layout.gutter),
    paddingTop: layout.isTablet ? 64 : 44,
    paddingBottom: layout.isTablet ? 64 : 48,
    flexDirection: layout.isDesktop ? 'row' : 'column',
    alignItems: layout.isDesktop ? 'center' : 'stretch',
    gap: layout.isDesktop ? theme.spacing['3xl'] : 0,
  }),
  heroText: (isDesktop: boolean) => ({
    flex: isDesktop ? 1 : undefined,
    maxWidth: isDesktop ? 560 : undefined,
  }),
  heroPreview: (isDesktop: boolean) => ({
    flex: isDesktop ? 1 : undefined,
    maxWidth: isDesktop ? 460 : undefined,
    marginTop: isDesktop ? 0 : 44,
  }),
  eyebrow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.secondarySoft,
    marginBottom: theme.spacing.lg,
  },
  eyebrowText: { ...theme.typography.labelSm, color: theme.colors.secondary },
  heroTitle: (size: number) => ({
    color: theme.colors.text,
    fontSize: size,
    lineHeight: Math.round(size * 1.14),
    fontWeight: '700',
    letterSpacing: size > 40 ? -1.2 : -0.6,
  }),
  highlight: { color: theme.colors.primaryGlow },
  heroCopy: {
    ...theme.typography.bodyLg,
    color: theme.colors.textSecondary,
    lineHeight: 25,
    marginTop: theme.spacing.lg,
    maxWidth: 500,
  },
  // Stretched buttons read as a clear stack on a phone; on anything wider they
  // turn into slabs, so there they sit side by side at their natural width.
  heroActions: (isTablet: boolean) => ({
    flexDirection: isTablet ? 'row' : 'column',
    alignItems: isTablet ? 'center' : 'stretch',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    marginTop: theme.spacing.xl,
  }),
  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.xl,
  },
  faceStack: { flexDirection: 'row' },
  face: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.background,
    marginRight: -7,
  },
  socialText: { ...theme.typography.bodySm, color: theme.colors.textSecondary, flex: 1 },

  workoutCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.md,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  previewHeading: { flex: 1 },
  previewOverline: {
    ...theme.typography.bodyXs,
    color: theme.colors.primaryGlow,
    fontWeight: '700',
    letterSpacing: 1,
  },
  previewTitle: { ...theme.typography.headingMd, color: theme.colors.text, marginTop: 4 },
  coachMini: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarText: { color: theme.colors.onPrimary, fontSize: 9, fontWeight: '700' },
  coachMiniText: { ...theme.typography.bodySm, color: theme.colors.textSecondary },
  progressLine: {
    height: 6,
    borderRadius: 4,
    backgroundColor: theme.colors.surfaceElevated,
    marginTop: theme.spacing.lg,
    overflow: 'hidden',
  },
  progressFill: {
    width: '50%',
    height: '100%',
    backgroundColor: theme.colors.success,
    borderRadius: 4,
  },
  progressText: {
    ...theme.typography.bodyXs,
    color: theme.colors.textSecondary,
    marginTop: 6,
    marginBottom: theme.spacing.sm,
  },
  exercise: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: theme.spacing.sm,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  complete: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  exerciseNo: { ...theme.typography.bodyXs, color: theme.colors.textSecondary },
  exerciseName: { ...theme.typography.bodySm, color: theme.colors.text, flex: 1 },
  done: { color: theme.colors.textSecondary, textDecorationLine: 'line-through' },
  exerciseSets: { ...theme.typography.labelSm, color: theme.colors.textSecondary },
  aiInsight: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.secondarySoft,
    marginTop: theme.spacing.sm,
  },
  insightContent: { flex: 1 },
  insightTitle: { ...theme.typography.labelSm, color: theme.colors.secondary },
  insightText: {
    ...theme.typography.bodyXs,
    lineHeight: 16,
    color: theme.colors.text,
    marginTop: 3,
  },

  /** Full-bleed tinted strip; its contents are re-centred inside it. */
  band: { backgroundColor: theme.colors.surface },
  bandHeader: (layout: LandingLayout) => ({
    ...centered(layout.gutter),
    paddingTop: layout.isTablet ? 64 : 48,
  }),
  benefits: (layout: LandingLayout) => ({
    ...centered(layout.gutter),
    paddingVertical: layout.isTablet ? 48 : theme.spacing.xl,
    flexDirection: layout.isTablet ? 'row' : 'column',
    gap: layout.isTablet ? theme.spacing.xl : theme.spacing.lg,
  }),
  benefitCell: (isTablet: boolean) => ({ flex: isTablet ? 1 : undefined }),
  benefit: (stacked: boolean) => ({
    flexDirection: stacked ? 'column' : 'row',
    gap: theme.spacing.md,
  }),
  benefitIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.secondarySoft,
    borderRadius: theme.borderRadius.md,
  },
  benefitText: { flex: 1 },
  benefitTitle: { ...theme.typography.headingSm, color: theme.colors.text },
  benefitCopy: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    marginTop: 3,
    lineHeight: 17,
  },

  section: (layout: LandingLayout) => ({
    ...centered(layout.gutter),
    paddingVertical: layout.isTablet ? 72 : 48,
  }),
  kicker: {
    ...theme.typography.labelSm,
    color: theme.colors.primaryGlow,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: (isDesktop: boolean) => ({
    ...(isDesktop ? theme.typography.displayLg : theme.typography.displayMd),
    color: theme.colors.text,
    lineHeight: isDesktop ? 40 : 34,
    letterSpacing: -0.5,
    maxWidth: 620,
  }),
  sectionCopy: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    lineHeight: 21,
    marginTop: theme.spacing.md,
    maxWidth: 500,
  },
  steps: (inRow: boolean) => ({
    marginTop: theme.spacing.xl,
    flexDirection: inRow ? 'row' : 'column',
    gap: theme.spacing.xl,
  }),
  stepCell: (inRow: boolean) => ({ flex: inRow ? 1 : undefined }),
  step: { flexDirection: 'row', gap: theme.spacing.lg },
  stepBody: { flex: 1 },
  stepNumber: { ...theme.typography.headingLg, color: theme.colors.primaryGlow, width: 28 },
  stepTitle: { ...theme.typography.headingMd, color: theme.colors.text },
  stepCopy: (inRow: boolean) => ({
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginTop: 5,
    maxWidth: inRow ? 330 : undefined,
  }),
  coachList: (layout: LandingLayout) => ({
    paddingHorizontal: layout.gutter,
    paddingTop: theme.spacing.xl,
    paddingBottom: layout.isTablet ? 64 : 48,
    gap: theme.spacing.md,
  }),

  pricingGrid: (gap: number) => ({
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap,
    marginTop: theme.spacing.xl,
  }),
  pricingCell: { flexGrow: 1, minWidth: 0 },
  note: {
    ...theme.typography.bodySm,
    color: theme.colors.textTertiary,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
    maxWidth: 620,
    alignSelf: 'center',
  },

  final: (layout: LandingLayout) => ({
    ...centered(layout.gutter),
    maxWidth: layout.isDesktop ? 900 : CONTENT_MAX_WIDTH,
    marginBottom: theme.spacing['3xl'],
    paddingVertical: layout.isTablet ? 48 : theme.spacing.xl,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.xl,
    alignItems: layout.isTablet ? 'center' : 'flex-start',
    gap: theme.spacing.md,
  }),
  finalTitle: (isDesktop: boolean) => ({
    ...(isDesktop ? theme.typography.displayMd : theme.typography.displaySm),
    color: theme.colors.text,
    lineHeight: isDesktop ? 36 : 30,
    textAlign: isDesktop ? 'center' : 'left',
  }),
  finalCopy: (isTablet: boolean) => ({
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    lineHeight: 21,
    textAlign: isTablet ? 'center' : 'left',
    maxWidth: 460,
  }),

  footer: {
    backgroundColor: theme.colors.surface,
    paddingTop: 40,
    paddingBottom: theme.spacing['2xl'],
  },
  footerInner: (gutter: number, isTablet: boolean) => ({
    ...centered(gutter),
    flexDirection: isTablet ? 'row' : 'column',
    justifyContent: 'space-between',
    gap: theme.spacing.xl,
  }),
  footerBrandBlock: { gap: 5 },
  footerBrand: { ...theme.typography.headingLg, color: theme.colors.text },
  footerCopy: { ...theme.typography.bodySm, color: theme.colors.textSecondary },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg },
  footerLink: { ...theme.typography.bodySm, color: theme.colors.textSecondary },
  copyright: {
    ...theme.typography.bodyXs,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xl,
    textAlign: 'center',
  },
}));
