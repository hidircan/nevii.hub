import { useLocalSearchParams } from "expo-router";
import { StudentScopeHomeworkDetailScreen } from "../../../src/features/student-scope/homework-screen";

export default function ParentHomeworkDetail() {
  const { homeworkId } = useLocalSearchParams<{ homeworkId: string }>();
  return <StudentScopeHomeworkDetailScreen homeworkId={homeworkId} />;
}
