import { STR, type Lang } from "../../i18n";
import { formatClientError } from "../../lib/user-error";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";

type Props = {
  lang: Lang;
  llmError: string | null;
  ttsError: string | null;
  secretsError: string | null;
  reloadLlm: () => void;
  reloadTts: () => void;
  reloadSecrets: () => void;
};

export function SettingsLoadErrors(props: Props) {
  const s = STR[props.lang];
  return (
    <>
      {props.llmError && (
        <Banner kind="error" action={<Button onClick={props.reloadLlm}>{s.settings.retry}</Button>}>
          {s.settings.loadLlmFailed} {formatClientError(props.lang, props.llmError, "load")}
        </Banner>
      )}
      {props.ttsError && (
        <Banner kind="error" action={<Button onClick={props.reloadTts}>{s.settings.retry}</Button>}>
          {s.settings.loadTtsFailed} {formatClientError(props.lang, props.ttsError, "load")}
        </Banner>
      )}
      {props.secretsError && (
        <Banner kind="error" action={<Button onClick={props.reloadSecrets}>{s.settings.retry}</Button>}>
          {s.settings.loadSecretsFailed} {formatClientError(props.lang, props.secretsError, "load")}
        </Banner>
      )}
    </>
  );
}
