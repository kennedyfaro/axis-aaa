import { Global, Module } from "@nestjs/common";
import { RadiusService } from "./radius.service";
import { CoaService } from "./coa.service";

@Global()
@Module({
  providers: [RadiusService, CoaService],
  exports: [RadiusService, CoaService],
})
export class RadiusModule {}
