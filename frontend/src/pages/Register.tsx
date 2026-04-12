import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Clock } from 'lucide-react';
import { SolkyLogo } from '@/components/SolkyLogo';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ variant: 'destructive', title: 'Password troppo corta', description: 'Minimo 6 caratteri' });
      return;
    }
    setLoading(true);
    try {
      const isPending = await register(name, email, password);
      if (isPending) setPending(true);
      else navigate('/');
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Errore di registrazione',
        description: err instanceof Error ? err.message : 'Errore sconosciuto',
      });
    } finally {
      setLoading(false);
    }
  };

  if (pending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <div className="w-full max-w-sm text-center space-y-6">
          <SolkyLogo size="lg" />
          <div className="flex flex-col items-center gap-4 bg-white border rounded-xl p-8 shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <Clock className="h-7 w-7 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2">Richiesta inviata</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                La tua richiesta è stata ricevuta. Un amministratore verificherà il tuo account e ti darà accesso a breve.
              </p>
            </div>
            <Link to="/login" className="text-sm text-[#C41E3A] font-medium hover:underline">
              Torna al login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Pannello sinistro */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#C41E3A] flex-col justify-between p-12 text-white">
        <SolkyLogo size="lg" variant="full" />
        <div className="space-y-4">
          <h1 className="text-4xl font-bold leading-tight">
            Unisciti al<br />team Solky Care
          </h1>
          <p className="text-red-100 text-lg leading-relaxed">
            Crea il tuo account per iniziare a registrare le ore lavorate. L'amministratore attiverà il tuo profilo a breve.
          </p>
        </div>
        <p className="text-red-200 text-sm">
          Solky Care Cooperativa Sociale · Sant'Antioco, Sardegna
        </p>
      </div>

      {/* Pannello destro */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-10 lg:hidden">
            <SolkyLogo size="lg" />
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">Crea account</h2>
          <p className="text-muted-foreground text-sm mb-8">
            Compila i dati per richiedere l'accesso
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                placeholder="Mario Rossi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@solkycare.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min. 6 caratteri"
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
              {loading ? 'Registrazione…' : 'Crea account'}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground text-center mt-6">
            Hai già un account?{' '}
            <Link to="/login" className="text-[#C41E3A] font-medium hover:underline">
              Accedi
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
