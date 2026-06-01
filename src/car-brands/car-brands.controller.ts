import { Controller, Get } from '@nestjs/common';
import { CarBrandsService } from './car-brands.service';

@Controller('car-brands')
export class CarBrandsController {
  constructor(private carBrandsService: CarBrandsService) {}

  @Get()
  findAll() {
    return this.carBrandsService.findAll();
  }
}
