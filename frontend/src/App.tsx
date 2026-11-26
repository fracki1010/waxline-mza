import { RequireStaff } from "./features/auth/RequireStaff";
import { Home } from "./features/home/Home";

export function App() {
  return (
    <RequireStaff>
      <Home />
    </RequireStaff>
  );
}
