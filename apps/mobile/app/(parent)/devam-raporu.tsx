import { useLocalSearchParams } from "expo-router";
import { AttendanceReportScreen } from "../../src/features/student-scope/attendance-report-screen";
import { parseLedgerStatusParam } from "../../src/lib/attendance-display";

/** Veli devam raporu — `?status=attended,processed` ile filtreli açılabilir (Gelişim sayaçları). */
export default function ParentDevamRaporu() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  return <AttendanceReportScreen basePath="/(parent)" initialStatus={parseLedgerStatusParam(status)} />;
}
