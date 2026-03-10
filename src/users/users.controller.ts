import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto, UpdateProfileDto, UpdateMeDto } from "./dto/update-user.dto";
import { FilterUsersDto } from "./dto/filter-users.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { UserRole } from "@prisma/client";

@Controller("users")
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 1. Crear Admin — solo SUPER_ADMIN
  @Post("admin")
  @Roles(UserRole.SUPER_ADMIN)
  createAdmin(@Body() dto: CreateUserDto) {
    return this.usersService.createAdmin(dto);
  }

  // 2. Crear Manager/Attendant — SUPER_ADMIN o ADMIN
  @Post("staff")
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createStaff(@Body() dto: CreateUserDto, @CurrentUser() user: any) {
    return this.usersService.createStaff(dto, user);
  }

  // 7. Editar mi perfil — cualquier usuario autenticado
  // (debe ir ANTES de :id para que "me" no se capture como param)
  @Patch("me")
  updateProfile(@Body() dto: UpdateProfileDto, @CurrentUser() user: any) {
    return this.usersService.updateProfile(user.id, dto);
  }

  // 8. Editar mi cuenta (password, idNumber, name) — cualquier usuario autenticado
  @Patch("me/account")
  updateMe(@Body() dto: UpdateMeDto, @CurrentUser() user: any) {
    return this.usersService.updateMe(user.id, dto);
  }

  // 4. Listar mis empleados — ADMIN
  @Get("my-employees")
  @Roles(UserRole.ADMIN)
  findMyEmployees(@Query() filters: FilterUsersDto, @CurrentUser() user: any) {
    return this.usersService.findMyEmployees(filters, user);
  }

  // 3. Listar todos — solo SUPER_ADMIN
  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  findAll(@Query() filters: FilterUsersDto) {
    return this.usersService.findAll(filters);
  }

  @Get("/admins")
  @Roles(UserRole.SUPER_ADMIN)
  getAdmins(@Query() filters: FilterUsersDto) {
    return this.usersService.findAll(filters);
  }

  // 6. Editar empleado relacionado — ADMIN
  @Patch("employee/:id")
  @Roles(UserRole.ADMIN)
  updateEmployee(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    return this.usersService.updateEmployee(id, dto, user);
  }

  // 5. Editar cualquier usuario — SUPER_ADMIN
  @Patch(":id")
  @Roles(UserRole.SUPER_ADMIN)
  updateUser(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(id, dto);
  }
}
