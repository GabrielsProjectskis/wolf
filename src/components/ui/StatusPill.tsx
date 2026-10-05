import { useT } from "../../i18n";
import { statusColour, type DisplayStatus } from "../../lib/document";

export const StatusPill = ({ status }: { status: DisplayStatus }) => {
  const t = useT();
  return (
    <span className="status" data-status={status}>
      <span className="status__dot" style={{ background: statusColour(status) }} aria-hidden />
      <span className="label">{t(`status.${status}`)}</span>
    </span>
  );
};
