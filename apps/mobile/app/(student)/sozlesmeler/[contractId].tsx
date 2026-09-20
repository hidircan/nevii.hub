import { useLocalSearchParams } from "expo-router";
import { StudentScopeContractDetailScreen } from "../../../src/features/student-scope/contracts-screen";

export default function StudentSozlesmeDetail() {
  const { contractId } = useLocalSearchParams<{ contractId: string }>();
  return <StudentScopeContractDetailScreen contractId={contractId} />;
}
