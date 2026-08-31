import { useLocalSearchParams } from "expo-router";
import { StudentScopePaymentDetailScreen } from "../../../src/features/student-scope/payments-screen";

export default function ParentPaymentDetail() {
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  return <StudentScopePaymentDetailScreen paymentId={paymentId} />;
}
