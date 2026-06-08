import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="py-16 flex flex-col items-center text-center gap-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Construction className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="font-medium">Próximamente</div>
          <p className="text-sm text-muted-foreground max-w-sm">
            Esta sección estará disponible en una próxima versión. Por ahora solo está la navegación.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
