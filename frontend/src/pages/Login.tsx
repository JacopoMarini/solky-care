import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { SolkyLogo } from '@/components/SolkyLogo';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Errore di accesso',
        description: err instanceof Error ? err.message : 'Credenziali non valide',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Pannello sinistro — brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#C41E3A] flex-col justify-between p-12 text-white">
        <SolkyLogo size="lg" variant="full" />
        <div className="space-y-4">
          <h1 className="text-4xl font-bold leading-tight">
            Gestione ore<br />del personale
          </h1>
          <p className="text-red-100 text-lg leading-relaxed">
            Traccia le giornate lavorative, gestisci le location e genera report mensili per la cooperativa.
          </p>
        </div>
        <p className="text-red-200 text-sm">
          Solky Care Cooperativa Sociale · Sant'Antioco, Sardegna
        </p>
      </div>

      {/* Pannello destro — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="flex justify-center mb-10 lg:hidden">
            <SolkyLogo size="lg" />
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">Accedi</h2>
          <p className="text-muted-foreground text-sm mb-8">
            Inserisci le tue credenziali per continuare
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@solkycare.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-[#C41E3A] hover:bg-[#a8182f] text-white font-semibold mt-2"
              disabled={loading}
            >
              {loading ? 'Accesso in corso…' : 'Accedi'}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground text-center mt-6">
            Non hai un account?{' '}
            <Link to="/register" className="text-[#C41E3A] font-medium hover:underline">
              Registrati
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
