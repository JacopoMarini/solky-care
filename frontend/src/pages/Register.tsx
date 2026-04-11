import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { UserPlus, Clock } from 'lucide-react';

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
      if (isPending) {
        setPending(true);
      } else {
        navigate('/');
      }
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

  // Schermata di attesa approvazione
  if (pending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <Clock className="h-7 w-7 text-amber-600" />
            </div>
            <CardTitle className="text-xl">Registrazione inviata</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              La tua richiesta è stata ricevuta. Un amministratore verificherà il tuo account e ti darà accesso a breve.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link to="/login" className="text-sm text-primary font-medium hover:underline">
              Torna al login
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <UserPlus className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Registrati</CardTitle>
          <CardDescription>Crea il tuo account per iniziare</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                placeholder="Mario Rossi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@esempio.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min. 6 caratteri"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Registrazione…' : 'Crea account'}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Hai già un account?{' '}
              <Link to="/login" className="text-primary font-medium hover:underline">
                Accedi
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
