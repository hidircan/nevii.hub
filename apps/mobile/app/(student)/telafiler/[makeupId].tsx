import { useLocalSearchParams } from "expo-router";
import { StudentScopeMakeupDetailScreen } from "../../../src/features/student-scope/makeup-screen";

export default function StudentTelafiDetay() {
  const { makeupId } = useLocalSearchParams<{ makeupId: string }>();
  return <StudentScopeMakeupDetailScreen basePath="/(student)" makeupId={makeupId ?? ""} />;
}
