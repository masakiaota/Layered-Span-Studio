import { useState } from "react";
import { Alert, Box, Button, Card, CardContent, Container, Stack, TextField, Typography } from "@mui/material";

export function LoginPage({
  loading,
  error,
  onLogin,
}: {
  loading: boolean;
  error: string;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("demo_login_user");
  const [password, setPassword] = useState("demo_login_pass");

  return (
    <Container maxWidth="sm" sx={{ display: "grid", minHeight: "100vh", placeItems: "center", py: 4 }}>
      <Card sx={{ width: "100%", borderRadius: 4 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="overline" color="primary.main">
                Material Workspace
              </Typography>
              <Typography variant="h4" sx={{ mt: 1 }}>
                Layered Span Studio
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.7 }}>
                Google Workspace 系の読みやすさを土台にした、ドキュメント注釈用フロントエンドである。
              </Typography>
            </Box>
            <Stack
              component="form"
              spacing={2}
              onSubmit={(event) => {
                event.preventDefault();
                void onLogin(username, password);
              }}
            >
              <TextField label="Username" value={username} onChange={(event) => setUsername(event.target.value)} fullWidth />
              <TextField
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                fullWidth
              />
              {error ? <Alert severity="error">{error}</Alert> : null}
              <Button type="submit" variant="contained" size="large" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}
