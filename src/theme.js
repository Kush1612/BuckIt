// Central theme and common styles used across the app
export const colors = {
  primary: '#FF6B93', // warm pink
  primaryDark: '#E54F7A',
  accent: '#FFDCE6',
  bg: '#FFF7FB',
  card: '#FFFFFF',
  muted: '#8A8A8A',
  text: '#222222'
};

export const spacing = {
  s: 8,
  m: 12,
  l: 20,
  xl: 28
};

export const cardStyle = {
  backgroundColor: colors.card,
  borderRadius: 12,
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
  padding: spacing.m
};

export default { colors, spacing, cardStyle };
