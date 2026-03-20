import { useState } from "react";
import { Alert, Box, Button, Card, CardContent, Container, Stack, TextField, Typography } from "@mui/material";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { useI18n } from "../i18n/useI18n";

export function LoginPage({
  loading,
  error,
  onLogin,
}: {
  loading: boolean;
  error: string;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [username, setUsername] = useState("demo_login_user");
  const [password, setPassword] = useState("demo_login_pass");

  return (
    <Container maxWidth="sm" sx={{ display: "grid", minHeight: "100vh", placeItems: "center", py: 4 }}>
      <Card sx={{ width: "100%", borderRadius: 4 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
              <Box>
                <Typography variant="h4">Layered Span Studio</Typography>
                <Typography color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.7 }}>
                  {t("login.description")}
                </Typography>
              </Box>
              <LanguageSwitcher sx={{ flexShrink: 0 }} />
            </Stack>
            <Stack
              component="form"
              spacing={2}
              onSubmit={(event) => {
                event.preventDefault();
                void onLogin(username, password);
              }}
            >
              <TextField label={t("login.username")} value={username} onChange={(event) => setUsername(event.target.value)} fullWidth />
              <TextField
                label={t("login.password")}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                fullWidth
              />
              {error ? <Alert severity="error">{error}</Alert> : null}
              <Button type="submit" variant="contained" size="large" disabled={loading}>
                {loading ? t("login.signingIn") : t("login.signIn")}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}
