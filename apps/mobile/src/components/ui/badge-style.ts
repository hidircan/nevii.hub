import { StyleSheet } from "react-native";
import { fonts } from "../../theme/tokens";
import { badgeColors, BADGE_TONE_COLORS } from "../../theme/badge-tones";

export { badgeColors, BADGE_TONE_COLORS };

export const badgeStyles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  text: { fontFamily: fonts.bold, fontSize: 14, fontWeight: "700" },
});
