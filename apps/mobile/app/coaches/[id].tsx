import { Pressable, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CheckCircle2, Star } from 'lucide-react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { featuredCoaches } from '../../src/data/landing';
import { Button } from '../../src/components/ui/Button';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { goBack } from '../../src/lib/navigation';

export default function CoachProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const coach = featuredCoaches.find((item) => item.id === id);
  const { styles, theme } = useStyles(stylesheet);
  if (!coach) return <Redirect href="/" />;
  return <ScreenContainer contentContainerStyle={styles.content}>
    <Pressable onPress={() => goBack('/')} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back"><ArrowLeft size={18} color={theme.colors.text} /><Text style={styles.backText}>Back to coaches</Text></Pressable>
    <View style={[styles.avatar, { backgroundColor: coach.avatarColors[0] }]}><View style={[styles.avatarAccent, { backgroundColor: coach.avatarColors[1] }]} /><Text style={styles.initials}>{coach.initials}</Text></View>
    <View style={styles.rating}><Star size={15} fill={theme.colors.warning} color={theme.colors.warning} /><Text style={styles.ratingText}>{coach.rating} coach rating</Text></View>
    <Text style={styles.name}>{coach.name}</Text><Text style={styles.specialty}>{coach.specialty}</Text><Text style={styles.description}>{coach.description}</Text>
    <View style={styles.detailCard}><Text style={styles.detailTitle}>What you can expect</Text><Text style={styles.detailCopy}>{coach.experience} • Training built around {coach.tags.slice(0, 2).join(' and ').toLowerCase()}.</Text><View style={styles.tags}>{coach.tags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}</View></View>
    <View style={styles.priceRow}><View><Text style={styles.price}>{coach.price}</Text><Text style={styles.priceHint}>Mock coaching availability</Text></View><Button title="Create account" onPress={() => router.push('/(auth)/register')} /></View>
    <View style={styles.reassurance}><CheckCircle2 size={17} color={theme.colors.success} /><Text style={styles.reassuranceText}>You’ll choose your program and preferences before anything begins.</Text></View>
  </ScreenContainer>;
}
const stylesheet = createStyleSheet((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background }, content: { paddingBottom: 52 }, back: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: 36 }, backText: { ...theme.typography.labelMd, color: theme.colors.text }, avatar: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }, avatarAccent: { position: 'absolute', width: 88, height: 88, borderRadius: 44, left: 38, top: 38, opacity: 0.8 }, initials: { color: '#fff', fontSize: 28, fontWeight: '700' }, rating: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: theme.spacing.lg }, ratingText: { ...theme.typography.labelSm, color: theme.colors.text }, name: { ...theme.typography.displayLg, color: theme.colors.text, marginTop: theme.spacing.sm }, specialty: { ...theme.typography.labelMd, color: theme.colors.primary, marginTop: 4 }, description: { ...theme.typography.bodyLg, color: theme.colors.textSecondary, lineHeight: 25, marginTop: theme.spacing.lg }, detailCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.lg, marginTop: theme.spacing.xl }, detailTitle: { ...theme.typography.headingSm, color: theme.colors.text }, detailCopy: { ...theme.typography.bodySm, color: theme.colors.textSecondary, lineHeight: 19, marginTop: theme.spacing.sm }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: theme.spacing.md }, tag: { paddingVertical: 5, paddingHorizontal: 8, backgroundColor: theme.colors.primarySoft, borderRadius: theme.borderRadius.full }, tagText: { ...theme.typography.bodyXs, color: theme.colors.primaryGlow }, priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md, marginTop: theme.spacing.xl }, price: { ...theme.typography.headingLg, color: theme.colors.text }, priceHint: { ...theme.typography.bodyXs, color: theme.colors.textTertiary, marginTop: 3 }, reassurance: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xl, alignItems: 'flex-start' }, reassuranceText: { ...theme.typography.bodySm, color: theme.colors.textSecondary, flex: 1, lineHeight: 18 },
}));
