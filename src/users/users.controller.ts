import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { MentionsQueryDto } from './dto/mentions-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  // Declared before /:userId to prevent NestJS treating "mentions" as a userId param
  @Get(':userId/mentions')
  getMentions(
    @Param('userId', ParseIntPipe) id: number,
    @Query() query: MentionsQueryDto,
  ) {
    return this.usersService.getMentions(id, query.page ?? 1, query.pageSize ?? 20);
  }

  @Get(':userId')
  findOne(@Param('userId', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: any) {
    // user is null/undefined on this public route — performedBy will be null
    return this.usersService.create(dto, user?.id ?? null);
  }

  @Post('update/:userId')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('userId', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    return this.usersService.update(id, dto, user?.id ?? null);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('userId', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.usersService.remove(id, user?.id ?? null);
  }
}
